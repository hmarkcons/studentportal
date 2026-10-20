// The email a registered student gets with their HMARK Student Portal login.
//
// Three of them, in the student's house style (studentEmail.ts):
//
//   welcome        the first time their login is sent, once the signed
//                  agreement is on file: "Welcome aboard", Pakistan's
//                  landmarks and the plane leaving them for the world, the
//                  login as a boarding pass — Pakistan to their destination,
//                  their intake — what happens next, and the counsellor and
//                  processing officer looking after them, with how to reach
//                  each;
//   login          the login on its own: sent again, or sent before the signed
//                  agreement is in, when it is too early to welcome anyone on
//                  board;
//   new_password   a Super Admin has set a new password, which has signed them
//                  out everywhere.
//
// Pure, so the unit tests import it directly (scripts/portal-welcome-email-test.mjs).
import { whatsappLink } from "./reengagement.ts";
import {
  BODY,
  BRAND,
  DEEP,
  FAINT,
  FONT,
  GREEN,
  HAIR,
  INK,
  MINT,
  MINT_EDGE,
  MONO,
  assetUrl,
  button,
  callout,
  displayName,
  emailFrame,
  esc,
  firstName,
  footerText,
  heading,
  label,
  type Images,
  type OfficeDetails,
} from "./studentEmail.ts";

export { displayName, firstName } from "./studentEmail.ts";
export type { OfficeDetails } from "./studentEmail.ts";

export type PortalEmailKind = "welcome" | "login" | "new_password";

export type TeamMember = {
  name: string;
  /** Their designation, as staff records it: "Senior Counselor". */
  designation: string | null;
  phone: string | null;
  email: string | null;
};

export type PortalEmailInput = {
  kind: PortalEmailKind;
  studentName: string;
  /** The Student ID, which they can sign in with as well as their email. */
  studentCode: string | null;
  loginEmail: string;
  password: string;
  /** The portal's address, for the sign-in link and the hosted images. */
  siteUrl: string;
  /** Their primary destination: "Italy", "IT". */
  destination: { name: string; code: string | null } | null;
  intake: string | null;
  /** bachelors / masters / phd. */
  level: string | null;
  team: { counsellor: TeamMember | null; officer: TeamMember | null };
  office: OfficeDetails;
  /** Image sources in place of the hosted ones — a preview sends them inline. */
  images?: Images;
};

export type PortalEmail = { subject: string; preheader: string; html: string; text: string };

const LEVELS: Record<string, string> = { bachelors: "Bachelor's", masters: "Master's", phd: "PhD", foundation: "Foundation" };
export function levelLabel(level: string | null | undefined): string | null {
  const l = (level ?? "").trim();
  if (!l) return null;
  return LEVELS[l.toLowerCase()] ?? l.charAt(0).toUpperCase() + l.slice(1);
}

export function initials(name: string): string {
  return displayName(name)
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

const site = (input: Pick<PortalEmailInput, "siteUrl">) => input.siteUrl.replace(/\/+$/, "");
const signInUrl = (input: PortalEmailInput) => `${site(input)}/login`;

export function portalEmailSubject(input: Pick<PortalEmailInput, "kind" | "studentName">): string {
  if (input.kind === "welcome") return `Welcome aboard, ${firstName(input.studentName)}! Your HMARK Student Portal is ready`;
  if (input.kind === "new_password") return "Your new HMARK Student Portal password";
  return "Your HMARK Student Portal login";
}

function preheaderOf(input: PortalEmailInput): string {
  if (input.kind === "welcome") return `Your journey${input.destination ? ` to ${input.destination.name}` : ""} starts here — your portal login is inside.`;
  if (input.kind === "new_password") return "HMARK has set a new password for your portal. Sign in again with the details inside.";
  return "Your HMARK Student Portal login, and where to sign in.";
}

function introOf(input: PortalEmailInput): { eyebrow: string; title: string; lines: string[] } {
  const first = firstName(input.studentName);
  if (input.kind === "welcome") {
    return {
      eyebrow: "Your journey starts here",
      title: `Welcome aboard, ${first}!`,
      lines: [
        `Thank you for choosing HMARK Consultants${input.destination ? ` for your studies in ${input.destination.name}` : ""}. Your agreement is signed and your place with us is confirmed — from here on, we walk every step with you.`,
        "Your HMARK Student Portal is ready. It is where your documents, your university applications, your appointments and your visa come together, and where you can see at any moment exactly where things stand.",
      ],
    };
  }
  if (input.kind === "new_password") {
    return {
      eyebrow: "Your login has changed",
      title: "Your new portal password",
      lines: [`Hello ${first}, HMARK has set a new password for your Student Portal. You have been signed out everywhere — sign in again with the details below.`],
    };
  }
  return {
    eyebrow: "HMARK Student Portal",
    title: "Your portal login",
    lines: [`Hello ${first}, here is your HMARK Student Portal login, and where to sign in.`],
  };
}

const KEEP_SAFE =
  "Keep this login to yourself, and please don't forward this email. Only HMARK can change your password — if you need a new one, or anything doesn't work, message your counsellor.";

const STEPS = [
  { icon: "&#128273;", title: "Sign in", text: "With your Student ID or your email, and the password above." },
  {
    icon: "&#128196;",
    title: "Upload your documents",
    text: "Your checklist is on the Documents page. Your processing officer reviews each one and tells you if anything needs another look.",
  },
  { icon: "&#127891;", title: "Follow your applications", text: "Each university's progress, your intake dates and your appointments — as they happen." },
];

// ------------------------------------------------------------------ the boarding pass

function field(name: string, value: string | null, mono = false, stack = true) {
  return `<td${stack ? ' class="stack"' : ""} width="50%" style="padding:8px 8px 8px 0;vertical-align:top">
  ${label(name)}
  <div style="font-family:${mono ? MONO : FONT};font-size:15px;line-height:21px;color:${INK};font-weight:700;word-break:break-word">${esc(value || "—")}</div>
</td>`;
}

function credentialRow(name: string, value: string, big = false) {
  return `<tr><td style="padding:7px 0">
  <div style="font-family:${FONT};font-size:12px;line-height:16px;color:${BODY}">${esc(name)}</div>
  <div style="font-family:${MONO};font-size:${big ? 20 : 16}px;line-height:${big ? 26 : 22}px;color:${INK};font-weight:700;letter-spacing:${big ? "1px" : "0"};word-break:break-all">${esc(value)}</div>
</td></tr>`;
}

/** The login, laid out as a boarding pass — the one part every one of the three emails carries. */
function boardingPass(input: PortalEmailInput): string {
  const to = input.destination;
  const level = levelLabel(input.level);
  const rows = [
    ...(input.studentCode ? [credentialRow("Student ID", input.studentCode)] : []),
    credentialRow(input.studentCode ? "or your email" : "Email", input.loginEmail),
    credentialRow("Password", input.password, true),
  ].join("");
  return `<div style="height:10px;line-height:10px;font-size:0">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${MINT_EDGE};border-radius:16px;background:#ffffff">
  <tr><td bgcolor="${DEEP}" style="border-radius:15px 15px 0 0;background:${DEEP};background-image:linear-gradient(90deg,${DEEP},${BRAND});padding:12px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:2px;font-weight:800;color:#ffffff;white-space:nowrap">&#9992;&nbsp;&nbsp;BOARDING PASS</td>
      <td align="right" class="hide-sm" style="font-family:${FONT};font-size:10px;line-height:16px;letter-spacing:1.6px;font-weight:700;color:#c9f0de;white-space:nowrap">HMARK STUDENT PORTAL</td>
    </tr></table>
  </td></tr>
  <tr><td class="px-pass" style="padding:20px 22px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="34%" style="vertical-align:bottom">
        ${label("From")}
        <div class="code" style="font-family:${FONT};font-size:42px;line-height:46px;font-weight:800;color:${INK};letter-spacing:1px">PK</div>
        <div style="font-family:${FONT};font-size:13px;line-height:18px;color:${BODY}">Pakistan</div>
      </td>
      <td width="32%" align="center" style="vertical-align:middle;padding-top:14px;font-family:${FONT};font-size:14px;line-height:18px;color:${BRAND};white-space:nowrap">&middot;&nbsp;&middot;&nbsp;&middot;&nbsp;<span style="font-size:22px;color:${GREEN}">&#9992;</span>&nbsp;&middot;&nbsp;&middot;&nbsp;&middot;</td>
      <td width="34%" align="right" style="vertical-align:bottom">
        ${label("To")}
        <div class="code" style="font-family:${FONT};font-size:42px;line-height:46px;font-weight:800;color:${INK};letter-spacing:1px">${to?.code ? esc(to.code.toUpperCase()) : "&#127758;"}</div>
        <div style="font-family:${FONT};font-size:13px;line-height:18px;color:${BODY}">${esc(to?.name || "Your destination")}</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="px-pass" style="padding:10px 22px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>${field("Passenger", displayName(input.studentName))}${field("Departs", input.intake)}</tr>
      ${level ? `<tr>${field("Class", level)}${field("Seat", "Reserved for you")}</tr>` : ""}
    </table>
  </td></tr>
  <tr><td class="px-pass" style="padding:14px 22px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${MINT};border:1px solid ${MINT_EDGE};border-radius:12px">
      <tr><td style="padding:14px 16px 10px">
        ${label("Your login", GREEN)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">${rows}</table>
      </td></tr>
    </table>
    ${button(signInUrl(input), "Board now &mdash; sign in &rarr;")}
  </td></tr>
  <tr><td style="padding:0 18px"><div style="border-top:2px dashed ${MINT_EDGE};height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>
  <tr><td class="px-pass" style="padding:16px 22px 18px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="88" style="vertical-align:middle"><img src="${esc(assetUrl(input.siteUrl, "qr", input.images))}" width="84" height="84" alt="A code to scan that opens the portal's sign-in page" style="display:block;width:84px;height:84px;border:0;border-radius:6px"></td>
      <td style="vertical-align:middle;padding-left:14px;font-family:${FONT};font-size:12px;line-height:18px;color:${BODY}">
        <span style="font-weight:700;color:${INK}">Scan to open the portal on your phone</span><br>
        Gate: <a href="${esc(signInUrl(input))}" target="_blank" style="color:${GREEN};text-decoration:none">${esc(site(input).replace(/^https?:\/\//, ""))}</a><br>
        Boarding: any time &mdash; it is open around the clock.
      </td>
    </tr></table>
  </td></tr>
</table>`;
}

function steps(): string {
  const rows = STEPS.map(
    (s, i) => `<tr>
  <td width="52" style="vertical-align:top;padding:0 0 16px">
    <div style="width:40px;height:40px;border-radius:20px;background:${MINT};border:1px solid ${MINT_EDGE};text-align:center;font-size:18px;line-height:40px">${s.icon}</div>
  </td>
  <td style="vertical-align:top;padding:2px 0 16px">
    <div style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:700;color:${INK}"><span style="color:${BRAND}">${i + 1}.</span> ${esc(s.title)}</div>
    <div style="font-family:${FONT};font-size:14px;line-height:21px;color:${BODY}">${esc(s.text)}</div>
  </td>
</tr>`
  ).join("");
  return `${heading("What happens next", 34)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

const TEAM_TINTS = [
  { bg: "#e3f4ec", ink: DEEP },
  { bg: "#e8edfb", ink: "#2c4fa3" },
];

function teamCard(member: TeamMember | null, role: string, pending: string, tint: (typeof TEAM_TINTS)[number], studentName: string): string {
  if (!member) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px dashed ${HAIR};border-radius:14px"><tr><td style="padding:16px 16px">
      ${label(role, GREEN)}
      <div style="font-family:${FONT};font-size:13px;line-height:19px;color:${BODY};margin-top:6px">${esc(pending)}</div>
    </td></tr></table>`;
  }
  const wa = whatsappLink(member.phone, `Hello ${displayName(member.name).split(" ")[0]}, this is ${displayName(studentName)}.`);
  const links = [
    member.phone ? `&#128222;&nbsp;<a href="tel:${esc(member.phone.replace(/[^\d+]/g, ""))}" style="color:${GREEN};text-decoration:none">${esc(member.phone)}</a>` : "",
    wa ? `&#128172;&nbsp;<a href="${esc(wa)}" target="_blank" style="color:${GREEN};text-decoration:none">WhatsApp</a>` : "",
    member.email ? `&#9993;&nbsp;<a href="mailto:${esc(member.email)}" style="color:${GREEN};text-decoration:none">${esc(member.email).replace("@", "@&#8203;")}</a>` : "",
  ].filter(Boolean);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${HAIR};border-radius:14px;background:#ffffff"><tr><td style="padding:16px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="52" style="vertical-align:top"><div style="width:44px;height:44px;border-radius:22px;background:${tint.bg};color:${tint.ink};text-align:center;font-family:${FONT};font-size:15px;line-height:44px;font-weight:800">${esc(initials(member.name))}</div></td>
      <td style="vertical-align:top">
        ${label(role, GREEN)}
        <div style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:700;color:${INK}">${esc(displayName(member.name))}</div>
        ${member.designation ? `<div style="font-family:${FONT};font-size:12px;line-height:17px;color:${FAINT}">${esc(member.designation)}</div>` : ""}
      </td>
    </tr></table>
    ${links.length ? `<div style="font-family:${FONT};font-size:13px;line-height:22px;color:${BODY};margin-top:10px">${links.join("<br>")}</div>` : ""}
  </td></tr></table>`;
}

function team(input: PortalEmailInput): string {
  return `${heading("Your HMARK team", 20)}
<p style="margin:-6px 0 14px;font-family:${FONT};font-size:14px;line-height:21px;color:${BODY}">The people looking after you — call, message or email them any time.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td class="stack" width="50%" style="vertical-align:top;padding:0 6px 12px 0">${teamCard(
    input.team.counsellor,
    "Your counsellor",
    "Your counsellor will be introduced to you shortly.",
    TEAM_TINTS[0],
    input.studentName
  )}</td>
  <td class="stack" width="50%" style="vertical-align:top;padding:0 0 12px 6px">${teamCard(
    input.team.officer,
    "Your processing officer",
    "Your applications and visa are handled by the HMARK processing team until an officer is named for you.",
    TEAM_TINTS[1],
    input.studentName
  )}</td>
</tr></table>`;
}

// ------------------------------------------------------------------ the email

export function portalEmail(input: PortalEmailInput): PortalEmail {
  const subject = portalEmailSubject(input);
  const preheader = preheaderOf(input);
  const intro = introOf(input);
  const welcome = input.kind === "welcome";
  const html = emailFrame({
    subject,
    preheader,
    banner: welcome ? "hero" : "logins",
    eyebrow: intro.eyebrow,
    title: intro.title,
    intro: intro.lines.map(esc),
    content: [boardingPass(input), welcome ? steps() : "", welcome ? team(input) : "", callout(esc(KEEP_SAFE))].join(""),
    signoff: welcome ? "We are delighted to have you with us. Here&rsquo;s to the journey ahead!" : "Warm regards,",
    office: input.office,
    siteUrl: input.siteUrl,
    images: input.images,
  });
  return { subject, preheader, html, text: portalEmailText(input) };
}

/** The plain-text twin, for clients that show no HTML. */
export function portalEmailText(input: PortalEmailInput): string {
  const intro = introOf(input);
  const lines: string[] = [intro.title, "", ...intro.lines.flatMap((l) => [l, ""])];
  lines.push("YOUR BOARDING PASS — HMARK STUDENT PORTAL");
  lines.push(`From Pakistan to ${input.destination?.name ?? "your destination"}${input.intake ? ` · departs ${input.intake}` : ""}`);
  lines.push(`Passenger: ${displayName(input.studentName)}`);
  if (input.studentCode) lines.push(`Student ID: ${input.studentCode}`);
  lines.push(`${input.studentCode ? "Or your email" : "Email"}: ${input.loginEmail}`);
  lines.push(`Password: ${input.password}`);
  lines.push(`Sign in at: ${signInUrl(input)}`, "");
  if (input.kind === "welcome") {
    lines.push("WHAT HAPPENS NEXT");
    STEPS.forEach((s, i) => lines.push(`${i + 1}. ${s.title} — ${s.text}`));
    lines.push("", "YOUR HMARK TEAM");
    for (const [role, m] of [
      ["Your counsellor", input.team.counsellor],
      ["Your processing officer", input.team.officer],
    ] as const) {
      if (!m) {
        lines.push(`${role}: to be introduced shortly.`);
        continue;
      }
      lines.push(`${role}: ${displayName(m.name)}${m.designation ? ` (${m.designation})` : ""}`);
      if (m.phone) lines.push(`  Phone / WhatsApp: ${m.phone}`);
      if (m.email) lines.push(`  Email: ${m.email}`);
    }
    lines.push("");
  }
  lines.push(KEEP_SAFE, "");
  lines.push(input.kind === "welcome" ? "We are delighted to have you with us. Here's to the journey ahead!" : "Warm regards,", "The HMARK Consultants team", "");
  lines.push(...footerText(input.office));
  return lines.join("\n");
}
