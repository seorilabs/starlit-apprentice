import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const checkOnly = process.argv.includes("--check");
const failures = [];

const pageRoot = "public-pages";
const packetPath = "qa/public-release-pages.md";
const lastUpdated = "2026-06-18";

const spec = readJson("specs/starlit-apprentice.json");
const manifest = readJson("qa/release-artifact-manifest.json");
const rootPackage = readJson("package.json");
const googlePlay = readJson("play-store/google-play.config.json");
const appStore = readJson("app-store/app-store.config.json");
const supportEmail = resolvedContactEmail();

const pageFiles = [
  ["public-pages/index.html", renderMarketingPage()],
  ["public-pages/privacy-policy.html", renderPrivacyPolicyPage()],
  ["public-pages/support.html", renderSupportPage()],
  [packetPath, renderPacket()]
];

const assetFiles = [
  ["play-store/assets/icon-512.png", "public-pages/assets/icon-512.png"],
  ["play-store/assets/feature-graphic-1024x500.png", "public-pages/assets/feature-graphic-1024x500.png"]
];

if (checkOnly) {
  checkPages();
} else {
  writePages();
}

printReport();

if (failures.length > 0) {
  process.exit(1);
}

function writePages() {
  for (const [path, content] of pageFiles) {
    write(path, content);
  }

  for (const [source, target] of assetFiles) {
    const sourcePath = resolve(repoRoot, source);
    if (!existsSync(sourcePath)) {
      failures.push(`Missing public page asset source: ${source}`);
      continue;
    }
    mkdirSync(dirname(resolve(repoRoot, target)), { recursive: true });
    copyFileSync(sourcePath, resolve(repoRoot, target));
  }
}

function checkPages() {
  for (const [path, content] of pageFiles) {
    const absolutePath = resolve(repoRoot, path);
    if (!existsSync(absolutePath)) {
      failures.push(`Missing generated public page file: ${path}. Run pnpm release:public-pages.`);
      continue;
    }
    if (read(path) !== content) {
      failures.push(`${path} is stale. Run pnpm release:public-pages after updating store configs, release artifacts, or listing copy.`);
    }
  }

  for (const [source, target] of assetFiles) {
    const sourcePath = resolve(repoRoot, source);
    const targetPath = resolve(repoRoot, target);
    if (!existsSync(sourcePath)) {
      failures.push(`Missing public page asset source: ${source}`);
      continue;
    }
    if (!existsSync(targetPath)) {
      failures.push(`Missing generated public page asset: ${target}. Run pnpm release:public-pages.`);
      continue;
    }
    if (hashFile(sourcePath) !== hashFile(targetPath)) {
      failures.push(`${target} is stale. Run pnpm release:public-pages after updating store assets.`);
    }
  }
}

function renderMarketingPage() {
  const title = `${spec.app.displayName} | ${spec.app.englishDisplayName}`;
  const koDescription = googlePlay.storeListing?.fullDescription?.["ko-KR"] ?? "";
  const enDescription = googlePlay.storeListing?.fullDescription?.["en-US"] ?? "";
  return renderPage({
    title,
    active: "home",
    description: googlePlay.storeListing?.shortDescription?.["ko-KR"] ?? spec.app.subtitle,
    body: `
      <section class="hero">
        <div class="hero-media">
          <img src="./assets/feature-graphic-1024x500.png" alt="${escapeHtml(spec.app.displayName)} feature graphic" />
        </div>
        <div class="hero-copy">
          <p class="eyebrow">Pixel life simulation</p>
          <h1>${escapeHtml(spec.app.displayName)}</h1>
          <p>${escapeHtml(googlePlay.storeListing?.shortDescription?.["ko-KR"] ?? spec.app.subtitle)}</p>
          <div class="store-line">
            <span>Version ${escapeHtml(rootPackage.version)}</span>
            <span>Local-only save</span>
            <span>No login or payment</span>
          </div>
        </div>
      </section>

      <main class="content">
        <section class="section">
          <h2>게임 소개</h2>
          ${paragraphs(firstParagraphs(koDescription, 2))}
        </section>
        <section class="section">
          <h2>About</h2>
          ${paragraphs(firstParagraphs(enDescription, 2))}
        </section>
        <section class="section grid">
          <article>
            <h3>Core loop</h3>
            <p>Plan four weekly actions each month, watch stats change, and reach one of 30 endings after 12 months.</p>
          </article>
          <article>
            <h3>Data boundary</h3>
            <p>Progress and ending collection stay on the device. This first release has no account, server save, payment, ads, analytics, or tracking SDK.</p>
          </article>
          <article>
            <h3>Store support</h3>
            <p>${supportEmail ? `Use the privacy policy and support pages in this bundle as static hostable sources after the final public domain is confirmed. Support email: <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>.` : "Use the privacy policy and support pages in this bundle as static hostable sources after the final public domain and contact fields are confirmed."}</p>
          </article>
        </section>
      </main>
    `
  });
}

function renderPrivacyPolicyPage() {
  return renderPage({
    title: `Privacy Policy | ${spec.app.englishDisplayName}`,
    active: "privacy",
    description: "Privacy policy candidate for Star Apprentice.",
    body: `
      <main class="content narrow">
        <section class="section">
          <p class="eyebrow">Last updated ${lastUpdated}</p>
          <h1>Privacy Policy</h1>
          <p><strong>${escapeHtml(spec.app.displayName)} / ${escapeHtml(spec.app.englishDisplayName)}</strong> is a bundled mobile game. The first release is designed to run without account login, server save, payment, production ads, analytics, or tracking SDKs.</p>
        </section>

        <section class="section">
          <h2>Data We Collect</h2>
          <p>We do not collect, share, sell, or transmit user data in the first release boundary represented by this repository.</p>
          <p>Game progress and ending collection data are saved locally on your device only. They are not sent to a Seorilabs server.</p>
        </section>

        <section class="section">
          <h2>Local Storage</h2>
          <p>The app uses local device storage to keep one progress slot and the ending collection. Removing the app or clearing app data may delete this local progress.</p>
        </section>

        <section class="section">
          <h2>Accounts, Payments, Ads, Analytics</h2>
          <p>This release has no account system, no in-app purchase, no billing SDK, no production ad SDK, no Firebase SDK, no analytics SDK, and no third-party tracking SDK.</p>
        </section>

        <section class="section">
          <h2>Permissions And Network</h2>
          <p>The Android shell may include the standard WebView internet permission from Capacitor, but the shipped app bundle does not configure a remote app URL and the game source does not use network APIs in this MVP boundary.</p>
        </section>

        <section class="section">
          <h2>Contact</h2>
          <p>${supportEmail ? `For support, contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>. Before store submission, replace the unresolved store config fields with the hosted privacy policy and support URLs.` : "The public support contact is not finalized in this repository yet. Before store submission, replace the unresolved store config fields with the confirmed support contact and hosted privacy policy URL."}</p>
        </section>
      </main>
    `
  });
}

function renderSupportPage() {
  return renderPage({
    title: `Support | ${spec.app.englishDisplayName}`,
    active: "support",
    description: "Support page candidate for Star Apprentice.",
    body: `
      <main class="content narrow">
        <section class="section">
          <p class="eyebrow">Support</p>
          <h1>${escapeHtml(spec.app.displayName)} Support</h1>
          <p>${supportEmail ? `This static page is the hostable support-page source for store review. For support, contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>. The final public HTTPS support URL and App Store review contact name/phone still require confirmation before production submission.` : "This static page is the hostable support-page source for store review. The final public support email or contact form is still a manual release field and must be confirmed before production submission."}</p>
        </section>

        <section class="section">
          <h2>Common Questions</h2>
          <h3>Where is my progress saved?</h3>
          <p>Progress is saved only on the device. There is no account login or server save in the first release.</p>
          <h3>Can progress be restored after reinstalling?</h3>
          <p>No. Because the first release does not use a server account, uninstalling the app or clearing app data may remove local progress.</p>
          <h3>How do I delete my data?</h3>
          <p>Delete the app or clear app data from the operating system settings. There is no server-held account data to request for deletion.</p>
          <h3>Does the app include purchases or ads?</h3>
          <p>No. The first release boundary has no payment SDK, no billing flow, and no production ad SDK.</p>
        </section>

        <section class="section">
          <h2>Store Review Contact Boundary</h2>
          <p>${supportEmail ? "Do not submit this support page as a final store URL until it is hosted on a confirmed HTTPS domain and the remaining contact/review fields in the release packet are completed." : "Do not submit this support page as final until the store configs no longer contain unresolved contact fields. The release packet lists the fields that must be completed."}</p>
        </section>
      </main>
    `
  });
}

function renderPage({ title, active, description, body }) {
  const nav = [
    ["home", "Home", "./index.html"],
    ["privacy", "Privacy", "./privacy-policy.html"],
    ["support", "Support", "./support.html"]
  ];

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <style>
      :root {
        color-scheme: light;
        --ink: #202124;
        --muted: #5f6368;
        --line: #d9dce3;
        --paper: #ffffff;
        --soft: #f4f6fb;
        --brand: ${spec.app.primaryColor};
        --accent: #157a6e;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        line-height: 1.6;
      }

      a {
        color: inherit;
      }

      .topbar {
        border-bottom: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.94);
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .topbar-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        max-width: 1040px;
        margin: 0 auto;
        padding: 14px 20px;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 800;
        text-decoration: none;
      }

      .brand img {
        width: 34px;
        height: 34px;
        border-radius: 8px;
      }

      nav {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      nav a {
        border-radius: 8px;
        color: var(--muted);
        font-size: 14px;
        font-weight: 700;
        padding: 8px 10px;
        text-decoration: none;
      }

      nav a[aria-current="page"] {
        background: var(--soft);
        color: var(--ink);
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
        gap: 32px;
        max-width: 1040px;
        margin: 0 auto;
        padding: 32px 20px 22px;
        align-items: center;
      }

      .hero-media {
        background: #f1f3f8;
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
      }

      .hero-media img {
        display: block;
        width: 100%;
        height: auto;
      }

      .hero-copy h1,
      .content h1 {
        margin: 6px 0 12px;
        font-size: 64px;
        line-height: 1.02;
      }

      .hero-copy p,
      .content p {
        color: var(--muted);
        margin: 0 0 14px;
      }

      .eyebrow {
        color: var(--accent) !important;
        font-size: 13px;
        font-weight: 800;
        margin: 0 0 6px !important;
        text-transform: uppercase;
      }

      .store-line {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 18px;
      }

      .store-line span {
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--ink);
        font-size: 13px;
        font-weight: 700;
        padding: 6px 9px;
      }

      .content {
        max-width: 1040px;
        margin: 0 auto;
        padding: 12px 20px 56px;
      }

      .content.narrow {
        max-width: 780px;
        padding-top: 40px;
      }

      .section {
        border-top: 1px solid var(--line);
        padding: 24px 0;
      }

      .section h2 {
        font-size: 22px;
        line-height: 1.2;
        margin: 0 0 10px;
      }

      .section h3 {
        font-size: 16px;
        margin: 18px 0 6px;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
      }

      .grid article {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
      }

      .footer {
        border-top: 1px solid var(--line);
        color: var(--muted);
        font-size: 13px;
        padding: 20px;
        text-align: center;
      }

      @media (max-width: 760px) {
        .topbar-inner {
          align-items: flex-start;
          flex-direction: column;
        }

        nav {
          flex-wrap: wrap;
        }

        .hero {
          grid-template-columns: 1fr;
          padding-top: 22px;
        }

        .hero-copy h1,
        .content h1 {
          font-size: 38px;
        }

        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="./index.html">
          <img src="./assets/icon-512.png" alt="" />
          <span>${escapeHtml(spec.app.englishDisplayName)}</span>
        </a>
        <nav aria-label="Public release pages">
          ${nav.map(([key, label, href]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
        </nav>
      </div>
    </header>
    ${body}
    <footer class="footer">
      ${escapeHtml(spec.app.displayName)} / ${escapeHtml(spec.app.englishDisplayName)} · Static release page candidate · Last updated ${lastUpdated}
    </footer>
  </body>
</html>
`;
}

function renderPacket() {
  const unresolvedRows = publicPageUnresolvedFields();
  return `# Public Release Pages Packet

This file is generated from app spec, store configs, store assets, and \`qa/release-artifact-manifest.json\`.

The generated HTML files are hostable static page candidates. They do not replace the manual requirement to confirm a public domain and final store-console URLs.

## Build Identity

| Field | Value |
| --- | --- |
| App | \`${manifest.appName}\` |
| Version | \`${manifest.version}\` |
| Manifest generated | \`${manifest.generatedAt}\` |
| Manual QA build ID | \`${manifest.manualQaBuildId}\` |

## Generated Files

| File | Purpose |
| --- | --- |
| \`public-pages/index.html\` | Marketing/product page candidate for App Store marketing URL |
| \`public-pages/privacy-policy.html\` | Privacy policy page candidate for Play/App Store privacy URL |
| \`public-pages/support.html\` | Support page candidate for App Store support URL |
| \`public-pages/assets/icon-512.png\` | Copied from \`play-store/assets/icon-512.png\` |
| \`public-pages/assets/feature-graphic-1024x500.png\` | Copied from \`play-store/assets/feature-graphic-1024x500.png\` |

## Suggested URL Mapping

| Store field | Suggested hosted path |
| --- | --- |
| Google Play \`privacyPolicyUrl\` | \`https://<confirmed-domain>/starlit-apprentice/privacy-policy.html\` |
| App Store \`privacyPolicyUrl\` | \`https://<confirmed-domain>/starlit-apprentice/privacy-policy.html\` |
| App Store \`supportUrl\` | \`https://<confirmed-domain>/starlit-apprentice/support.html\` |
| App Store \`marketingUrl\` | \`https://<confirmed-domain>/starlit-apprentice/\` |
| Native share ending URL base | \`https://<confirmed-domain>/starlit-apprentice/\` |

## Remaining Manual Fields

${unresolvedRows.length === 0 ? "- none" : unresolvedRows.map((row) => `- ${row}`).join("\n")}

## Host And Submission Boundary

- Run \`pnpm release:public-pages\` before copying this directory to a public host.
- Do not paste placeholder URLs into store consoles. Replace \`<confirmed-domain>\` with the actual hosted domain only after it is reachable over HTTPS.
- Native share evidence must use a public HTTPS ending URL without username/password credentials; \`capacitor://localhost\`, \`file://\`, credentialed HTTPS URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast/special-purpose ranges, and preview-only URLs are not valid recipient handoff proof.
- App, runtime smoke, and store URL checks share the same public URL guard through \`@starlit-apprentice/product-core\`; username/password credentials, \`example.com\`, \`example.org\`, \`example.net\`, \`.example\`, \`.local\`, \`.test\`, \`.invalid\`, localhost, non-public/reserved IPv4, and IPv6 local/documentation/multicast/special-purpose hosts are rejected. The IPv4 guard preserves IANA globally reachable \`192.0.0.9/32\` and \`192.0.0.10/32\`, while rejecting the surrounding \`192.0.0.0/24\` and documentation \`192.0.2.0/24\` ranges. The IPv6 guard rejects release evidence URLs in special-purpose ranges such as \`64:ff9b:1::/48\`, \`100::/64\`, \`100:0:0:1::/64\`, \`2001:2::/48\`, \`3fff::/20\`, and \`5f00::/16\`.
- Do not mark the privacy/support/marketing URL gates complete while \`play-store/google-play.config.json\` or \`app-store/app-store.config.json\` still contains \`확정 필요\` for the corresponding fields.
- If final support contact wording changes, update \`scripts/public-release-pages.mjs\`, regenerate this packet, and rerun \`pnpm check:public-pages\`.
`;
}

function publicPageUnresolvedFields() {
  return [
    ["Google Play", "contactEmail", googlePlay.contactEmail],
    ["Google Play", "privacyPolicyUrl", googlePlay.privacyPolicyUrl],
    ["App Store", "contact.email", appStore.contact?.email],
    ["App Store", "privacyPolicyUrl", appStore.privacyPolicyUrl],
    ["App Store", "supportUrl", appStore.supportUrl],
    ["App Store", "marketingUrl", appStore.marketingUrl]
  ]
    .filter(([, , value]) => String(value ?? "").includes("확정 필요"))
    .map(([target, field, value]) => `${target}: \`${field}\` = ${value}`);
}

function resolvedContactEmail() {
  for (const value of [googlePlay.contactEmail, appStore.contact?.email]) {
    const email = String(value ?? "").trim();
    if (email && !email.includes("확정 필요")) {
      return email;
    }
  }
  return null;
}

function paragraphs(items) {
  return items.map((item) => `<p>${escapeHtml(item)}</p>`).join("\n");
}

function firstParagraphs(text, limit) {
  return String(text)
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function write(path, content) {
  const absolutePath = resolve(repoRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function printReport() {
  console.log(checkOnly ? "Public release pages check" : "Public release pages");
  console.log(checkOnly ? "==========================" : "====================");
  console.log("");
  console.log(`Pages: ${pageRoot}`);
  console.log(`Packet: ${packetPath}`);
  console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Public release pages checks: PASS" : "Public release pages checks: FAIL");
}

function printSection(title, items) {
  console.log(title);
  if (items.length === 0) {
    console.log("- none");
  } else {
    for (const item of items) {
      console.log(`- ${item}`);
    }
  }
  console.log("");
}
