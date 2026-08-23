import {
  buildPublicEndingShareUrl,
  isBlockedPublicUrlHost as isProductCoreBlockedPublicUrlHost,
  isPublicHttpsUrl,
  parsePublicHttpsUrl
} from "../product-core-ts/dist/index.js";
import { isBlockedPublicUrlHost as isScriptBlockedPublicUrlHost } from "./public-url-guard.mjs";

const hostCases = [
  ["starlit-apprentice.seorilabs.com", false],
  ["sub.seorilabs.com", false],
  ["2606:4700:4700::1111", false],
  ["localhost", true],
  ["127.0.0.1", true],
  ["0.0.0.0", true],
  ["10.0.0.7", true],
  ["100.64.0.7", true],
  ["172.16.0.7", true],
  ["192.168.0.7", true],
  ["192.0.0.8", true],
  ["192.0.0.9", false],
  ["192.0.0.10", false],
  ["192.0.0.170", true],
  ["192.0.2.7", true],
  ["198.18.0.7", true],
  ["198.51.100.7", true],
  ["203.0.113.7", true],
  ["169.254.0.7", true],
  ["::", true],
  ["::1", true],
  ["fc00::1", true],
  ["fd12:3456::1", true],
  ["fe80::1", true],
  ["fe90::1", true],
  ["fea0::1", true],
  ["febf::1", true],
  ["ff00::1", true],
  ["64:ff9b:1::1", true],
  ["100::1", true],
  ["100:0:0:1::1", true],
  ["2001:2::1", true],
  ["2001:db8::1", true],
  ["3fff::1", true],
  ["5f00::1", true],
  ["::ffff:192.168.0.7", true],
  ["example.com", true],
  ["share.example.com", true],
  ["starlit.local", true],
  ["starlit.test", true],
  ["starlit.invalid", true],
  ["starlit.example", true]
];

for (const [host, expectedBlocked] of hostCases) {
  const productCoreBlocked = isProductCoreBlockedPublicUrlHost(host);
  const scriptBlocked = isScriptBlockedPublicUrlHost(host);
  assertEqual(
    productCoreBlocked,
    scriptBlocked,
    `URL guard parity mismatch for host ${host}: product-core=${productCoreBlocked}, script=${scriptBlocked}.`
  );
  assertEqual(productCoreBlocked, expectedBlocked, `Unexpected product-core URL guard result for host ${host}.`);
  assertEqual(scriptBlocked, expectedBlocked, `Unexpected script URL guard result for host ${host}.`);
}

const acceptedUrls = [
  "https://starlit-apprentice.seorilabs.com/play/?ending=scholar",
  "https://192.0.0.9/play/?ending=scholar",
  "https://192.0.0.10/play/?ending=scholar",
  "https://[2606:4700:4700::1111]/play/?ending=scholar"
];

for (const url of acceptedUrls) {
  if (!isPublicHttpsUrl(url)) {
    throw new Error(`Product-core public URL guard rejected a public HTTPS URL: ${url}`);
  }
  if (parsePublicHttpsUrl(url) === null) {
    throw new Error(`Product-core public URL parser rejected a public HTTPS URL: ${url}`);
  }
}

const rejectedUrls = [
  "",
  "not-a-url",
  "http://starlit-apprentice.seorilabs.com/play/?ending=scholar",
  "https://release:secret@starlit-apprentice.seorilabs.com/play/?ending=scholar",
  "https://localhost/play/?ending=scholar",
  "https://127.0.0.1/play/?ending=scholar",
  "https://0.0.0.0/play/?ending=scholar",
  "https://10.0.0.7/play/?ending=scholar",
  "https://100.64.0.7/play/?ending=scholar",
  "https://172.16.0.7/play/?ending=scholar",
  "https://192.168.0.7/play/?ending=scholar",
  "https://192.0.0.8/play/?ending=scholar",
  "https://192.0.0.170/play/?ending=scholar",
  "https://192.0.2.7/play/?ending=scholar",
  "https://198.18.0.7/play/?ending=scholar",
  "https://198.51.100.7/play/?ending=scholar",
  "https://203.0.113.7/play/?ending=scholar",
  "https://169.254.0.7/play/?ending=scholar",
  "https://[::]/play/?ending=scholar",
  "https://[::1]/play/?ending=scholar",
  "https://[fc00::1]/play/?ending=scholar",
  "https://[fd12:3456::1]/play/?ending=scholar",
  "https://[fe80::1]/play/?ending=scholar",
  "https://[fe90::1]/play/?ending=scholar",
  "https://[fea0::1]/play/?ending=scholar",
  "https://[febf::1]/play/?ending=scholar",
  "https://[ff00::1]/play/?ending=scholar",
  "https://[64:ff9b:1::1]/play/?ending=scholar",
  "https://[100::1]/play/?ending=scholar",
  "https://[100:0:0:1::1]/play/?ending=scholar",
  "https://[2001:2::1]/play/?ending=scholar",
  "https://[2001:db8::1]/play/?ending=scholar",
  "https://[3fff::1]/play/?ending=scholar",
  "https://[5f00::1]/play/?ending=scholar",
  "https://[::ffff:192.168.0.7]/play/?ending=scholar",
  "https://example.com/play/?ending=scholar",
  "https://share.example.com/play/?ending=scholar",
  "https://starlit.local/play/?ending=scholar",
  "https://starlit.test/play/?ending=scholar",
  "https://starlit.invalid/play/?ending=scholar",
  "https://starlit.example/play/?ending=scholar",
  "capacitor://localhost/?ending=scholar",
  "file:///private/tmp/starlit/index.html?ending=scholar"
];

for (const url of rejectedUrls) {
  if (isPublicHttpsUrl(url) || parsePublicHttpsUrl(url) !== null) {
    throw new Error(`Product-core public URL guard accepted a non-public release URL: ${url}`);
  }
  if (buildPublicEndingShareUrl("scholar", url) !== undefined) {
    throw new Error(`Product-core public URL guard built a share URL from a non-public base: ${url}`);
  }
}

assertEqual(
  buildPublicEndingShareUrl(
    "scholar",
    "https://starlit-apprentice.seorilabs.com/play/?utm=old#ignored"
  ),
  "https://starlit-apprentice.seorilabs.com/play/?ending=scholar",
  "Product-core public URL guard did not canonicalize ending share URLs."
);

assertEqual(
  buildPublicEndingShareUrl("scholar", "capacitor://localhost/?ending=scholar", acceptedUrls[0]),
  "https://starlit-apprentice.seorilabs.com/play/?ending=scholar",
  "Product-core public URL guard did not fall back to a public base URL."
);

assertEqual(
  buildPublicEndingShareUrl("unknown-ending", acceptedUrls[0]),
  undefined,
  "Product-core public URL guard built a share URL for an unknown ending code."
);

console.log("Public URL guard parity check: PASS");

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, got ${String(actual)}.`);
  }
}
