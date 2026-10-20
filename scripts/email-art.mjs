// The illustrations the student emails carry (public/email), drawn here as SVG
// and rendered to JPEG — so a change to the art is a change to this file and
// a run of it, not a hunt for the designer's source:
//
//   node scripts/email-art.mjs            writes public/email/*.jpg
//   node scripts/email-art.mjs <folder>   writes them to <folder> instead
//
// One welcome hero, 1200 x 520: Pakistan — the Karakoram with K2, Badshahi
// Mosque, Minar-e-Pakistan, Faisal Mosque and Mazar-e-Quaid, a crescent and
// star — and a plane taking off from home to the world.
//
// Ten banners, 1200 x 300, one per kind of email, all on the same sky with the
// same plane crossing it: the invoice, an overdue payment, a receipt, a
// reminder, documents, a message, an application, an interview, a login, an
// update. Shown at half size, so they are sharp on every screen.
//
// And the two pieces every email shares: the HMARK logo, cut down from
// public/hmark-logo.png to the size an email shows it at twice over, and the
// boarding pass's QR code, which opens the portal's sign-in page.
//
// Text is never drawn into an image: an email client that blocks images still
// reads in full, from the alt text and the words around it.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import QRCode from "qrcode";

/** Where the boarding pass's QR code leads: the portal's own sign-in page. */
const SIGN_IN = "https://portal.hmarkconsultants.com/login";

const OUT = process.argv[2] ?? new URL("../public/email/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const SKIES = {
  green: ["#0a5a42", "#14946d", "#2f6fc4"],
  amber: ["#7a3a0a", "#c4661a", "#e3a43c"],
  indigo: ["#1f3a78", "#3a5cc0", "#14946d"],
  bright: ["#0b6a4c", "#1aa57a", "#4bb3d6"],
};

const PLANE = (x, y, r = 0, s = 1) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
  <path d="M-44 0 C-40 -7 -10 -8 32 -6 C46 -5 52 -2 54 0 C52 2 46 5 32 6 C-10 8 -40 7 -44 0 Z" fill="#ffffff"/>
  <path d="M6 -6 L-16 -44 L-6 -44 L26 -6 Z" fill="#ffffff"/>
  <path d="M6 6 L-16 44 L-6 44 L26 6 Z" fill="#ffffff"/>
  <path d="M-34 -5 L-46 -22 L-39 -22 L-24 -5 Z" fill="#ffffff"/>
  <path d="M-34 5 L-46 22 L-39 22 L-24 5 Z" fill="#ffffff"/>
  <path d="M40 -3 C46 -2 49 -1 50 0 C49 1 46 2 40 3 Z" fill="#9fd8ff"/>
</g>`;

const SPARKLE = (x, y, s = 1, o = 0.8) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12 l3.5 8.5 l8.5 3.5 l-8.5 3.5 l-3.5 8.5 l-3.5 -8.5 l-8.5 -3.5 l8.5 -3.5 z" fill="#ffffff" opacity="${o}"/>`;

/** The sky every banner shares: its gradient, a glow, a corner of the globe, stars, and the plane on its dotted path. */
function sky(tone, id) {
  const [a, b, c] = SKIES[tone];
  return `<defs>
    <linearGradient id="s${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <radialGradient id="g${id}" cx="0.3" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <clipPath id="c${id}"><rect width="1200" height="300"/></clipPath>
  </defs>
  <rect width="1200" height="300" fill="url(#s${id})"/>
  <rect width="1200" height="300" fill="url(#g${id})"/>
  <g clip-path="url(#c${id})">
    <circle cx="1130" cy="330" r="250" fill="#ffffff" opacity="0.07"/>
    <circle cx="1130" cy="330" r="210" fill="#ffffff" opacity="0.08"/>
    <g fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2">
      <ellipse cx="1130" cy="330" rx="210" ry="70"/><ellipse cx="1130" cy="330" rx="210" ry="140"/>
      <ellipse cx="1130" cy="330" rx="80" ry="210"/><ellipse cx="1130" cy="330" rx="150" ry="210"/>
    </g>
  </g>
  <g fill="#ffffff"><circle cx="60" cy="50" r="2.2" opacity="0.6"/><circle cx="700" cy="40" r="2" opacity="0.55"/><circle cx="1000" cy="60" r="2.4" opacity="0.6"/><circle cx="560" cy="250" r="1.8" opacity="0.5"/></g>
  ${SPARKLE(130, 230, 1, 0.6)}${SPARKLE(1060, 120, 1.1, 0.8)}${SPARKLE(640, 70, 0.8, 0.7)}
  <path d="M640 230 C 760 120, 900 70, 1010 80" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 14" opacity="0.8"/>
  ${PLANE(1020, 80, -6, 1.05)}`;
}

// ------------------------------------------------------------------ scenes, each centred near x = 360

const PAPER = (x, y, w, h, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#ffffff"/>${extra}`;
const LINES = (x, y, w, n, gap = 22, color = "#d8e6df") =>
  Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i === n - 1 ? w * 0.6 : w}" height="9" rx="4.5" fill="${color}"/>`).join("");
const COINS = (x, y) =>
  [0, 1, 2]
    .map(
      (i) =>
        `<ellipse cx="${x}" cy="${y - i * 16}" rx="44" ry="14" fill="#e0a92c"/><rect x="${x - 44}" y="${y - i * 16 - 10}" width="88" height="10" fill="#e0a92c"/><ellipse cx="${x}" cy="${y - i * 16 - 10}" rx="44" ry="14" fill="#ffd166"/>`
    )
    .join("") + `<ellipse cx="${x}" cy="${y - 42}" rx="22" ry="6" fill="none" stroke="#c48a14" stroke-width="3"/>`;
const CAL = (x, y, head) => `<rect x="${x}" y="${y}" width="190" height="180" rx="18" fill="#ffffff"/>
  <path d="M${x} ${y + 18} a18 18 0 0 1 18 -18 h154 a18 18 0 0 1 18 18 v34 h-190 z" fill="${head}"/>
  <rect x="${x + 40}" y="${y - 14}" width="12" height="32" rx="6" fill="#2a3346"/><rect x="${x + 138}" y="${y - 14}" width="12" height="32" rx="6" fill="#2a3346"/>
  ${[0, 1, 2]
    .map((r) => [0, 1, 2, 3].map((c) => `<rect x="${x + 22 + c * 40}" y="${y + 70 + r * 34}" width="26" height="22" rx="6" fill="${r === 1 && c === 2 ? head : "#e3ece7"}"/>`).join(""))
    .join("")}`;
const CLOCK = (x, y, r, rim, face = "#ffffff") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${rim}"/><circle cx="${x}" cy="${y}" r="${r - 9}" fill="${face}"/>
  <rect x="${x - 3}" y="${y - r + 22}" width="6" height="${r - 22}" rx="3" fill="#2a3346"/><rect x="${x}" y="${y - 3}" width="${r - 30}" height="6" rx="3" fill="#2a3346" transform="rotate(35 ${x} ${y})"/>
  <circle cx="${x}" cy="${y}" r="6" fill="#2a3346"/>`;
const CHECK = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/><path d="M${x - r * 0.42} ${y + 2} l${r * 0.28} ${r * 0.3} l${r * 0.6} -${r * 0.62}" fill="none" stroke="#ffffff" stroke-width="${r * 0.2}" stroke-linecap="round" stroke-linejoin="round"/>`;

const SCENES = {
  invoice: () => `${PAPER(250, 60, 190, 220, `<rect x="250" y="60" width="190" height="44" rx="14" fill="#cfeee0"/><rect x="250" y="88" width="190" height="16" fill="#cfeee0"/>`)}
    ${LINES(276, 126, 138, 4)}<rect x="276" y="222" width="80" height="16" rx="8" fill="#14946d"/>
    ${COINS(500, 262)}${SPARKLE(470, 120, 1.2, 0.9)}`,
  overdue: () => `${CAL(230, 70, "#f0a43c")}${CLOCK(470, 190, 70, "#ffd166")}
    <path d="M420 128 l-20 -20 M520 128 l20 -20" stroke="#ffd166" stroke-width="12" stroke-linecap="round"/>`,
  receipt: () => `${PAPER(250, 52, 190, 228)}${LINES(276, 84, 138, 4)}
    <path d="M250 248 l20 18 l20 -18 l20 18 l20 -18 l20 18 l20 -18 l20 18 l20 -18 l20 18 v14 h-190 z" fill="#ffffff"/>
    ${CHECK(452, 196, 64, "#22b07d")}
    <g fill="#ffd166"><circle cx="540" cy="90" r="7"/><circle cx="210" cy="110" r="6"/><rect x="520" y="230" width="14" height="6" rx="3" transform="rotate(30 527 233)"/><rect x="200" y="200" width="14" height="6" rx="3" transform="rotate(-25 207 203)"/></g>
    <g fill="#ffffff" opacity="0.85"><circle cx="560" cy="160" r="5"/><circle cx="196" cy="70" r="4"/></g>`,
  reminder: () => `${CAL(240, 70, "#3a5cc0")}${CLOCK(480, 196, 62, "#ffffff", "#eaf1ff")}${SPARKLE(540, 96, 1.2, 0.9)}`,
  documents: () => `<path d="M230 110 a16 16 0 0 1 16 -16 h70 l22 22 h112 a16 16 0 0 1 16 16 v140 a16 16 0 0 1 -16 16 h-204 a16 16 0 0 1 -16 -16 z" fill="#e0a92c"/>
    <rect x="262" y="78" width="150" height="120" rx="10" fill="#ffffff"/>${LINES(282, 100, 110, 3, 20)}
    <rect x="284" y="66" width="150" height="120" rx="10" fill="#ffffff" opacity="0.92"/>
    <path d="M230 150 h236 a16 16 0 0 1 16 16 v104 a16 16 0 0 1 -16 16 h-220 a16 16 0 0 1 -16 -16 z" fill="#ffd166"/>
    <circle cx="520" cy="130" r="46" fill="#ffffff"/><path d="M520 152 v-42 m-18 18 l18 -18 l18 18" fill="none" stroke="#14946d" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
  message: () => `<path d="M220 80 h230 a26 26 0 0 1 26 26 v84 a26 26 0 0 1 -26 26 h-150 l-40 34 v-34 h-40 a26 26 0 0 1 -26 -26 v-84 a26 26 0 0 1 26 -26 z" fill="#ffffff"/>
    ${LINES(250, 112, 190, 3, 24)}
    <path d="M420 170 h150 a22 22 0 0 1 22 22 v58 a22 22 0 0 1 -22 22 h-20 v28 l-34 -28 h-96 a22 22 0 0 1 -22 -22 v-58 a22 22 0 0 1 22 -22 z" fill="#ffd166"/>
    <circle cx="460" cy="222" r="9" fill="#ffffff"/><circle cx="494" cy="222" r="9" fill="#ffffff"/><circle cx="528" cy="222" r="9" fill="#ffffff"/>`,
  application: () => `<path d="M210 120 L340 62 L470 120 Z" fill="#ffffff"/><rect x="214" y="120" width="252" height="16" fill="#ffffff"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${232 + i * 46}" y="140" width="22" height="104" rx="4" fill="#ffffff"/>`).join("")}
    <rect x="204" y="244" width="272" height="20" rx="4" fill="#ffffff"/><circle cx="340" cy="100" r="12" fill="#cfeee0"/>
    <g transform="translate(520 120) rotate(-12)"><path d="M0 -26 L62 0 L0 26 L-62 0 Z" fill="#1d2433"/><path d="M-34 12 L-34 34 C-34 46 34 46 34 34 L34 12 L0 26 Z" fill="#2a3346"/><circle r="4.5" fill="#ffd166"/><path d="M0 0 C18 6 40 10 46 14 L46 44" fill="none" stroke="#ffd166" stroke-width="3.5" stroke-linecap="round"/><path d="M40 44 L52 44 L50 60 L42 60 Z" fill="#ffd166"/></g>`,
  interview: () => `<rect x="214" y="70" width="270" height="170" rx="16" fill="#ffffff"/><rect x="230" y="86" width="238" height="138" rx="10" fill="#dceee6"/>
    <circle cx="349" cy="140" r="26" fill="#14946d"/><path d="M299 224 c0 -38 100 -38 100 0 z" fill="#14946d"/>
    <rect x="190" y="240" width="318" height="18" rx="9" fill="#ffffff"/>
    <rect x="420" y="98" width="38" height="28" rx="6" fill="#ffffff"/><circle cx="439" cy="112" r="6" fill="#ffd166"/>
    <path d="M520 110 h70 a16 16 0 0 1 16 16 v34 a16 16 0 0 1 -16 16 h-8 v18 l-22 -18 h-40 a16 16 0 0 1 -16 -16 v-34 a16 16 0 0 1 16 -16 z" fill="#ffd166"/>
    <circle cx="538" cy="143" r="6" fill="#ffffff"/><circle cx="558" cy="143" r="6" fill="#ffffff"/><circle cx="578" cy="143" r="6" fill="#ffffff"/>`,
  logins: () => `<rect x="236" y="130" width="160" height="130" rx="22" fill="#ffd166"/>
    <path d="M266 130 v-30 a50 50 0 0 1 100 0 v30" fill="none" stroke="#ffffff" stroke-width="20" stroke-linecap="round"/>
    <circle cx="316" cy="186" r="16" fill="#7a5a10"/><rect x="310" y="190" width="12" height="34" rx="6" fill="#7a5a10"/>
    <g transform="translate(470 180) rotate(-30)"><circle r="40" fill="#ffffff"/><circle r="15" fill="#14946d"/><rect x="34" y="-10" width="120" height="20" rx="10" fill="#ffffff"/><rect x="120" y="8" width="16" height="26" rx="4" fill="#ffffff"/><rect x="92" y="8" width="14" height="20" rx="4" fill="#ffffff"/></g>`,
  update: () => `<path d="M340 64 a12 12 0 0 1 12 12 v6 c46 8 74 44 74 92 v52 l22 30 h-216 l22 -30 v-52 c0 -48 28 -84 74 -92 v-6 a12 12 0 0 1 12 -12 z" fill="#ffffff"/>
    <path d="M314 266 a26 26 0 0 0 52 0 z" fill="#ffffff"/><circle cx="420" cy="96" r="26" fill="#ffd166"/>
    ${SPARKLE(210, 120, 1.1, 0.85)}${SPARKLE(500, 210, 0.9, 0.8)}`,
};

const TONE = { invoice: "green", overdue: "amber", receipt: "bright", reminder: "indigo", documents: "green", message: "indigo", application: "green", interview: "indigo", logins: "green", update: "bright" };

export function bannerSvg(kind) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300">${sky(TONE[kind], kind)}${SCENES[kind]()}</svg>`;
}

/** The welcome hero: Pakistan's landmarks, and the plane leaving them for the world. */
export function heroSvg() {
  return readHero();
}
import { readFileSync } from "node:fs";
function readHero() {
  return readFileSync(new URL("./email-art/welcome-hero.svg", import.meta.url), "utf8");
}

async function jpeg(svg, width, height, file) {
  const png = await sharp(Buffer.from(svg), { density: 144 }).resize(width, height).png().toBuffer();
  const out = await sharp(png).flatten({ background: "#14946d" }).jpeg({ quality: 86, progressive: true, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(file);
  return out.size;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("email-art.mjs")) {
  mkdirSync(OUT, { recursive: true });
  console.log("welcome-hero.jpg", await jpeg(heroSvg(), 1200, 520, join(OUT, "welcome-hero.jpg")));
  for (const kind of Object.keys(SCENES)) console.log(`banner-${kind}.jpg`, await jpeg(bannerSvg(kind), 1200, 300, join(OUT, `banner-${kind}.jpg`)));
  // Shown 148 wide: 400 keeps it sharp on a phone's screen.
  const logo = await sharp(new URL("../public/hmark-logo.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))
    .resize({ width: 400 })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, "hmark-logo.png"));
  console.log("hmark-logo.png", logo.size);
  await QRCode.toFile(join(OUT, "portal-qr.png"), SIGN_IN, { width: 240, margin: 1, color: { dark: "#0a5a42", light: "#ffffff" } });
  console.log("portal-qr.png");
  writeFileSync(join(OUT, ".generated"), "Rendered by scripts/email-art.mjs — edit that, not these.\n");
}
