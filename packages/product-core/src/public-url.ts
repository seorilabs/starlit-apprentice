import { ENDINGS } from "./data.js";

const BLOCKED_PUBLIC_URL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::",
  "::1",
  "example.com",
  "example.org",
  "example.net"
]);

const BLOCKED_PUBLIC_URL_SUFFIXES = [".local", ".test", ".invalid", ".example"];
const PLACEHOLDER_DOMAIN_SUFFIXES = ["example.com", "example.org", "example.net"];
const KNOWN_ENDING_CODES = new Set(ENDINGS.map((ending) => ending.code));
const BLOCKED_IPV6_SPECIAL_RANGES: readonly Ipv6Range[] = [
  { prefix: [0x0064, 0xff9b, 0x0001], prefixBits: 48 },
  { prefix: [0x0100, 0x0000, 0x0000, 0x0000], prefixBits: 64 },
  { prefix: [0x0100, 0x0000, 0x0000, 0x0001], prefixBits: 64 },
  { prefix: [0x2001, 0x0002], prefixBits: 48 },
  { prefix: [0x2001, 0x0db8], prefixBits: 32 },
  { prefix: [0x3fff, 0x0000], prefixBits: 20 },
  { prefix: [0x5f00], prefixBits: 16 }
];

type Ipv6Range = {
  prefix: readonly number[];
  prefixBits: number;
};

export function parsePublicHttpsUrl(value: string | URL | null | undefined): URL | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const url = value instanceof URL ? new URL(value.toString()) : new URL(value.trim());
    return isPublicHttpsUrl(url) ? url : null;
  } catch {
    return null;
  }
}

export function isPublicHttpsUrl(value: string | URL | null | undefined): boolean {
  const url = value instanceof URL ? value : parseRawUrl(value);
  return Boolean(
    url &&
      url.protocol === "https:" &&
      url.hostname &&
      !hasUrlCredentials(url) &&
      !isBlockedPublicUrlHost(url.hostname)
  );
}

export function buildPublicEndingShareUrl(
  endingCode: string,
  preferredBaseUrl: string | URL | null | undefined,
  fallbackBaseUrl?: string | URL | null
): string | undefined {
  if (!KNOWN_ENDING_CODES.has(endingCode)) {
    return undefined;
  }

  const baseUrl = parsePublicHttpsUrl(preferredBaseUrl) ?? parsePublicHttpsUrl(fallbackBaseUrl);
  if (!baseUrl) {
    return undefined;
  }

  baseUrl.search = "";
  baseUrl.hash = "";
  baseUrl.searchParams.set("ending", endingCode);
  return baseUrl.toString();
}

export function isBlockedPublicUrlHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_PUBLIC_URL_HOSTS.has(normalized)) {
    return true;
  }
  if (PLACEHOLDER_DOMAIN_SUFFIXES.some((suffix) => normalized.endsWith(`.${suffix}`))) {
    return true;
  }
  if (BLOCKED_PUBLIC_URL_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }
  if (isNonPublicIpv4Host(normalized) || isNonPublicIpv6Host(normalized)) {
    return true;
  }
  return false;
}

function parseRawUrl(value: string | null | undefined): URL | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hasUrlCredentials(url: URL): boolean {
  return url.username !== "" || url.password !== "";
}

function isNonPublicIpv4Host(hostname: string): boolean {
  const octets = parseIpv4Octets(hostname);
  if (!octets) {
    return false;
  }

  const [first = 0, second = 0, third = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    isBlockedIana192SpecialHost(octets) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isBlockedIana192SpecialHost(octets: number[]): boolean {
  const [first = 0, second = 0, third = 0, fourth = 0] = octets;
  if (first !== 192 || second !== 0) {
    return false;
  }
  if (third === 0) {
    return fourth !== 9 && fourth !== 10;
  }
  return third === 2;
}

function isNonPublicIpv6Host(hostname: string): boolean {
  if (!hostname.includes(":")) {
    return false;
  }

  const hextets = parseIpv6Hextets(hostname);
  if (!hextets) {
    return false;
  }

  const [first = 0, second = 0] = hextets;
  const isUnspecified = hextets.every((hextet) => hextet === 0);
  const isLoopback = hextets.slice(0, 7).every((hextet) => hextet === 0) && hextets[7] === 1;
  const isIpv4Mapped = hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff;
  return (
    isUnspecified ||
    isLoopback ||
    isIpv4Mapped ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    isInAnyIpv6Range(hextets, BLOCKED_IPV6_SPECIAL_RANGES)
  );
}

function isInAnyIpv6Range(hextets: number[], ranges: readonly Ipv6Range[]): boolean {
  return ranges.some((range) => isIpv6InRange(hextets, range.prefix, range.prefixBits));
}

function isIpv6InRange(hextets: number[], prefix: readonly number[], prefixBits: number): boolean {
  const fullHextets = Math.floor(prefixBits / 16);
  const remainingBits = prefixBits % 16;

  for (let index = 0; index < fullHextets; index += 1) {
    if (hextets[index] !== (prefix[index] ?? 0)) {
      return false;
    }
  }

  if (remainingBits === 0) {
    return true;
  }

  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return ((hextets[fullHextets] ?? 0) & mask) === (((prefix[fullHextets] ?? 0) & mask) & 0xffff);
}

function parseIpv4Octets(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
  return octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? octets : null;
}

function parseIpv6Hextets(hostname: string): number[] | null {
  let value = hostname.toLowerCase();
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4Octets = parseIpv4Octets(value.slice(lastColon + 1));
    if (lastColon < 0 || !ipv4Octets) {
      return null;
    }
    const [first = 0, second = 0, third = 0, fourth = 0] = ipv4Octets;
    const high = (first << 8) | second;
    const low = (third << 8) | fourth;
    value = `${value.slice(0, lastColon)}:${high.toString(16)}:${low.toString(16)}`;
  }

  const compressionCount = value.match(/::/g)?.length ?? 0;
  if (compressionCount > 1) {
    return null;
  }

  const [leftRaw = "", rightRaw = ""] = value.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = compressionCount === 1 && rightRaw ? rightRaw.split(":") : [];
  const parsedLeft = parseIpv6Side(left);
  const parsedRight = parseIpv6Side(right);
  if (!parsedLeft || !parsedRight) {
    return null;
  }

  if (compressionCount === 0) {
    return parsedLeft.length === 8 ? parsedLeft : null;
  }

  const missing = 8 - parsedLeft.length - parsedRight.length;
  if (missing < 1) {
    return null;
  }
  return [...parsedLeft, ...Array.from({ length: missing }, () => 0), ...parsedRight];
}

function parseIpv6Side(parts: string[]): number[] | null {
  const hextets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) {
      return null;
    }
    hextets.push(Number.parseInt(part, 16));
  }
  return hextets;
}
