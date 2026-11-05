// Email campaigns, part 1 (0354): reading an upload, making it sendable,
// personalising it, checking it, and showing it safely.
//
// What these guard against: a zip that writes outside its folder or carries a
// program; a script, a form or an onclick reaching a recipient; an image left
// pointing at a path no email client can load; an email sent with no
// unsubscribe link; a name pasted into an email as markup; and the link
// checker being turned on the portal's own network.
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  MERGE_TAGS,
  contactMergeValues,
  mergeTagsIn,
  renderMergeTags,
  splitName,
  unknownMergeTags,
} from "../src/lib/emailCampaigns/mergeTags.ts";
import { readTemplateUpload, resolveAssetPath, safeZipPath, sniffImage } from "../src/lib/emailCampaigns/templateFiles.ts";
import { htmlToText, linksAndImages, processTemplateHtml } from "../src/lib/emailCampaigns/templateHtml.ts";
import { isPrivateHost, networkPreflight, overallStatus, staticPreflight } from "../src/lib/emailCampaigns/preflight.ts";
import { previewDocument, sanitizeEmailHtml } from "../src/lib/emailCampaigns/preview.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const enc = (s) => new TextEncoder().encode(s);
const zipOf = async (files) => {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
};
const MB = 1024 * 1024;

// ------------------------------------------------------------------ merge tags

test("merge tags: the list is the brief's, and a tag's fallback fills a blank", () => {
  assert.deepEqual(
    MERGE_TAGS.map((t) => t.tag),
    ["first_name", "last_name", "full_name", "email", "country_of_interest", "intake", "counsellor_name", "unsubscribe_url", "preferences_url", "web_version_url"]
  );
  assert.equal(renderMergeTags("Hi {{first_name|there}},", { first_name: "Ali" }), "Hi Ali,");
  assert.equal(renderMergeTags("Hi {{ first_name | there }},", { first_name: "  " }), "Hi there,");
  assert.equal(renderMergeTags("Hi {{FIRST_NAME}},", { first_name: "Ali" }), "Hi Ali,", "case does not matter");
});

test("merge tags: a value is text in HTML, never markup; a link tag is filled as it is", () => {
  assert.equal(renderMergeTags("{{full_name}}", { full_name: "<b>Ali</b> & co" }), "&lt;b&gt;Ali&lt;/b&gt; &amp; co");
  assert.equal(renderMergeTags("{{full_name}}", { full_name: "<b>Ali</b>" }, { html: false }), "<b>Ali</b>");
  assert.equal(renderMergeTags('<a href="{{unsubscribe_url}}">x</a>', { unsubscribe_url: "https://p.example/u/a?b=1&c=2" }), '<a href="https://p.example/u/a?b=1&c=2">x</a>');
});

test("merge tags: found once each, and an unknown one is named", () => {
  assert.deepEqual(mergeTagsIn("{{first_name}} {{intake}} {{first_name|x}} {{ fname }}"), ["first_name", "intake", "fname"]);
  assert.deepEqual(unknownMergeTags("{{first_name}} {{fname}} {{*|FNAME|*}}"), ["fname"]);
  assert.equal(renderMergeTags("[{{fname|friend}}]", {}), "[friend]", "an unknown tag prints its fallback, not braces");
});

test("merge tags: a contact's values come from their lead and counsellor", () => {
  assert.deepEqual(splitName("  Ayesha   Noor Khan "), { first: "Ayesha", last: "Noor Khan" });
  assert.deepEqual(splitName("Cher"), { first: "Cher", last: "" });
  const v = contactMergeValues({ full_name: "Ayesha Khan", email: "a@x.pk", country_of_interest: "Italy", intake: "Sept 2027" }, "Sara Ahmed", {
    unsubscribe_url: "https://u",
  });
  assert.deepEqual(v, {
    first_name: "Ayesha",
    last_name: "Khan",
    full_name: "Ayesha Khan",
    email: "a@x.pk",
    country_of_interest: "Italy",
    intake: "Sept 2027",
    counsellor_name: "Sara Ahmed",
    unsubscribe_url: "https://u",
  });
});

// ------------------------------------------------------------------ the upload

test("upload: one HTML file is taken as it is", async () => {
  const r = await readTemplateUpload("Email.HTML", enc("\uFEFF<p>Hi</p>"), { maxBytes: MB });
  assert.equal(r.kind, "html");
  assert.equal(r.html, "<p>Hi</p>", "a byte-order mark is dropped");
});

test("upload: wrong type, empty, oversized and fake zips are refused", async () => {
  assert.match((await readTemplateUpload("x.pdf", enc("x"), { maxBytes: MB })).error, /\.html file, or a \.zip/);
  assert.match((await readTemplateUpload("x.html", new Uint8Array(), { maxBytes: MB })).error, /empty/);
  assert.match((await readTemplateUpload("x.html", new Uint8Array(2 * MB), { maxBytes: MB })).error, /over the 1 MB limit/);
  assert.match((await readTemplateUpload("x.zip", enc("not a zip"), { maxBytes: MB })).error, /not a zip/);
});

test("upload: a zip's index.html, its images and stylesheets; scripts and junk set aside", async () => {
  const bytes = await zipOf({
    "email/index.html": '<img src="img/logo.png">',
    "email/img/logo.png": PNG,
    "email/style.css": "p{color:red}",
    "email/app.js": "alert(1)",
    "email/notes.txt": "hello",
    "__MACOSX/email/._index.html": "junk",
  });
  const r = await readTemplateUpload("t.zip", bytes, { maxBytes: MB });
  assert.equal(r.htmlPath, "email/index.html");
  assert.deepEqual([...r.files.keys()].sort(), ["email/img/logo.png", "email/style.css"]);
  assert.equal(r.files.get("email/img/logo.png").mime, "image/png");
  assert.deepEqual(r.ignored.map((i) => i.path).sort(), ["email/app.js", "email/notes.txt"]);
});

test("upload: a path out of the zip, a program, or a fake image refuses the whole zip", async () => {
  // JSZip tidies "../" away when it writes, so the hostile name is patched into the bytes (same length).
  // A byte-level swap: decoding as "latin1" is really windows-1252 and would mangle the PNG's 0x89.
  const slipBytes = await zipOf({ "index.html": "x", "QQ/QQevil.png": PNG });
  const from = enc("QQ/QQ");
  const to = enc("../..");
  for (let i = 0; i <= slipBytes.length - from.length; i++) {
    if (from.every((b, j) => slipBytes[i + j] === b)) slipBytes.set(to, i);
  }
  assert.match((await readTemplateUpload("t.zip", slipBytes, { maxBytes: MB })).error, /leaves the zip/);
  assert.match((await readTemplateUpload("t.zip", await zipOf({ "index.html": "x", "setup.exe": "MZ" }), { maxBytes: MB })).error, /program or script/);
  assert.match((await readTemplateUpload("t.zip", await zipOf({ "index.html": "x", "logo.png": "<?php" }), { maxBytes: MB })).error, /not one/);
  assert.match((await readTemplateUpload("t.zip", await zipOf({ "a.html": "x", "b.html": "y" }), { maxBytes: MB })).error, /none is called index\.html/);
  assert.match((await readTemplateUpload("t.zip", await zipOf({ "logo.png": PNG }), { maxBytes: MB })).error, /no HTML/);
});

test("upload: zip paths and image sniffing", () => {
  assert.equal(safeZipPath("a\\b/./c.png"), "a/b/c.png");
  assert.equal(safeZipPath("../x"), null);
  assert.equal(safeZipPath("/etc/passwd"), null);
  assert.equal(safeZipPath("C:/x.png"), null);
  assert.equal(sniffImage(PNG), "image/png");
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(enc('<?xml version="1.0"?><svg></svg>')), "image/svg+xml");
  assert.equal(sniffImage(enc("MZ")), null);
  assert.equal(resolveAssetPath("email/index.html", "./img/a.png?v=2"), "email/img/a.png");
  assert.equal(resolveAssetPath("email/index.html", "../shared/a.png"), "shared/a.png");
  assert.equal(resolveAssetPath("index.html", "../a.png"), null);
  assert.equal(resolveAssetPath("index.html", "https://x/a.png"), null);
  assert.equal(resolveAssetPath("index.html", "img/my%20logo.png"), "img/my logo.png");
});

// ------------------------------------------------------------------ processing

const files = new Map([
  ["img/logo.png", { bytes: PNG, mime: "image/png" }],
  ["img/bg.png", { bytes: PNG, mime: "image/png" }],
  ["css/main.css", { bytes: enc(".btn{color:#ffffff;background:#52be96} .hero{background:url(../img/bg.png)} @media (max-width:600px){.wrap{width:100%!important}}"), mime: "text/css" }],
]);
const assetUrl = (p) => `https://cdn.example/${p}`;
const SOURCE = `<!DOCTYPE html><html><head><link rel="stylesheet" href="css/main.css"><script src="x.js"></script></head>
<body><!--[if mso]><table><tr><td><![endif]--><div class="wrap">
<img src="img/logo.png" alt="HMARK"><img src="img/missing.png">
<div class="hero" onclick="steal()">Study in Italy, {{first_name|there}}</div>
<a class="btn" href="https://hmarkconsultants.com/italy?x=1">Apply now</a>
<a href="javascript:alert(1)">bad</a>
<form action="/x"><input name="e"><button>Go</button></form>
<iframe src="https://evil"></iframe><video src="v.mp4"></video>
<script>alert(1)</script>
</div><!--[if mso]></td></tr></table><![endif]--></body></html>`;

test("processing: what a client would block is taken out, and each kind is said", () => {
  const p = processTemplateHtml({ html: SOURCE, htmlPath: "index.html", files, assetUrl, footerAddress: "Karachi" });
  assert.ok(!/<script/i.test(p.html), "no script");
  assert.ok(!/onclick/i.test(p.html), "no handler");
  assert.ok(!/javascript:/i.test(p.html), "no javascript: link");
  assert.ok(!/<(form|input|button|iframe|video)/i.test(p.html), "no form, frame or video");
  const what = p.removed.map((r) => r.what);
  for (const w of ["Scripts", "Frames and embedded content", "Video and audio", "Forms and form fields", "Click and other event handlers", "javascript: links"]) {
    assert.ok(what.includes(w), w);
  }
  assert.equal(p.removed.find((r) => r.what === "Scripts").count, 2);
});

test("processing: images and backgrounds point at their public address; a missing file is listed", () => {
  const p = processTemplateHtml({ html: SOURCE, htmlPath: "index.html", files, assetUrl, footerAddress: "Karachi" });
  assert.ok(p.html.includes('src="https://cdn.example/img/logo.png"'));
  assert.ok(p.html.includes("https://cdn.example/img/bg.png"), "a background in the zip's CSS");
  assert.deepEqual(p.missingAssets, ["img/missing.png"]);
  assert.deepEqual(p.usedAssets.sort(), ["img/bg.png", "img/logo.png"]);
});

test("processing: the CSS is written onto the elements, media queries kept, Outlook's comments kept", () => {
  const p = processTemplateHtml({ html: SOURCE, htmlPath: "index.html", files, assetUrl, footerAddress: "Karachi" });
  assert.match(p.html, /<a class="btn" href="https:\/\/hmarkconsultants\.com\/italy\?x=1" style="color: #ffffff; background: #52be96;">/);
  assert.match(p.html, /@media \(max-width:600px\)/);
  assert.ok(!/<link rel="stylesheet"/i.test(p.html), "the zip's stylesheet is inlined, not linked");
  assert.ok(p.html.includes("<!--[if mso]>"), "conditional comments for Outlook survive");
  assert.ok(p.html.includes("{{first_name|there}}"), "merge tags pass through");
});

test("processing: an email without an unsubscribe link gets the footer; one with its own does not", () => {
  const p = processTemplateHtml({ html: SOURCE, htmlPath: "index.html", files, assetUrl, footerAddress: "Suite 101, Karachi" });
  assert.equal(p.footerAdded, true);
  assert.ok(p.html.includes("{{unsubscribe_url}}") && p.html.includes("{{preferences_url}}") && p.html.includes("Suite 101, Karachi"));
  const own = processTemplateHtml({ html: '<p>x <a href="{{unsubscribe_url}}">Stop</a></p>', htmlPath: "e.html", files: new Map(), assetUrl, footerAddress: "K" });
  assert.equal(own.footerAdded, false);
  assert.equal((own.html.match(/unsubscribe_url/g) ?? []).length, 1);
});

test("processing: links, images, size, tags and the plain-text version are read off the result", () => {
  const p = processTemplateHtml({ html: SOURCE, htmlPath: "index.html", files, assetUrl, footerAddress: "Karachi" });
  assert.deepEqual(p.links, [{ url: "https://hmarkconsultants.com/italy?x=1", text: "Apply now" }]);
  assert.deepEqual(p.images[1], { src: "img/missing.png", alt: null });
  assert.ok(p.sizeBytes > 0);
  assert.deepEqual(p.unknownTags, []);
  assert.match(p.text, /Study in Italy, \{\{first_name\|there\}\}/);
  assert.match(p.text, /Apply now \(https:\/\/hmarkconsultants\.com\/italy\?x=1\)/);
  assert.match(p.text, /Unsubscribe \(\{\{unsubscribe_url\}\}\)/);
});

test("plain text: block elements break lines, lists get dashes, hidden preheaders are left out", () => {
  const text = htmlToText(
    '<div style="display:none">Hidden preheader</div><h1>Title</h1><p>One</p><p>Two<br>Three</p><ul><li>A</li><li>B</li></ul><a href="mailto:x@y.z">Mail us</a>'
  );
  assert.equal(text, "Title\n\nOne\n\nTwo\nThree\n\n- A\n\n- B\n\nMail us");
});

// ------------------------------------------------------------------ pre-flight

const base = {
  html: "",
  text: "",
  removed: [],
  links: [],
  images: [],
  missingAssets: [],
  insecureImages: [],
  usedAssets: [],
  footerAdded: false,
  sizeBytes: 10_000,
  mergeTags: [],
  unknownTags: [],
  textLength: 1500,
  inlineError: null,
};
const statusOf = (checks, key) => checks.find((c) => c.key === key)?.status;

test("pre-flight: size, missing files, alt text, image-heavy, unknown tags", () => {
  assert.equal(statusOf(staticPreflight(base), "size"), "pass");
  assert.equal(statusOf(staticPreflight({ ...base, sizeBytes: 120 * 1024 }), "size"), "warn");
  assert.equal(statusOf(staticPreflight({ ...base, missingAssets: ["a.png"] }), "missing_files"), "fail");
  assert.equal(statusOf(staticPreflight({ ...base, images: [{ src: "x", alt: null }] }), "alt"), "warn");
  assert.equal(statusOf(staticPreflight({ ...base, images: [{ src: "x", alt: "" }] }), "alt"), "pass", "an empty alt is a decorative image, said on purpose");
  assert.equal(statusOf(staticPreflight({ ...base, images: [{ src: "x", alt: "a" }, { src: "y", alt: "b" }], textLength: 40 }), "image_text"), "warn");
  assert.equal(statusOf(staticPreflight({ ...base, unknownTags: ["fname"] }), "merge_tags"), "warn");
  assert.equal(overallStatus(staticPreflight({ ...base, missingAssets: ["a.png"] })), "fail");
  assert.equal(overallStatus(staticPreflight(base)), "pass");
});

const fakeFetch = (table) => async (url, init) => {
  const entry = table[url];
  if (entry === "timeout") {
    const e = new Error("timed out");
    e.name = "TimeoutError";
    throw e;
  }
  const [status, type, headStatus] = entry ?? [404, "text/html"];
  const s = init.method === "HEAD" && headStatus ? headStatus : status;
  return new Response(null, { status: s, headers: { "content-type": type } });
};

test("pre-flight network: broken links fail, slow ones warn, HEAD-refusing sites are asked for a byte", async () => {
  const checks = await networkPreflight(
    {
      links: [
        { url: "https://ok.example/", text: "" },
        { url: "https://gone.example/", text: "" },
        { url: "https://slow.example/", text: "" },
        { url: "https://nohead.example/", text: "" },
      ],
      images: [
        { src: "https://cdn.example/a.png", alt: "a" },
        { src: "https://cdn.example/page", alt: "b" },
      ],
    },
    {
      fetchImpl: fakeFetch({
        "https://ok.example/": [200, "text/html"],
        "https://gone.example/": [404, "text/html"],
        "https://slow.example/": "timeout",
        "https://nohead.example/": [200, "text/html", 405],
        "https://cdn.example/a.png": [200, "image/png"],
        "https://cdn.example/page": [200, "text/html"],
      }),
    }
  );
  const links = checks.find((c) => c.key === "links");
  assert.equal(links.status, "fail");
  assert.equal(links.items.length, 2, "the 404 and the slow one; the HEAD-refuser passed on GET");
  assert.ok(links.items.some((i) => i.includes("gone.example") && i.includes("404")));
  const images = checks.find((c) => c.key === "images_load");
  assert.equal(images.status, "fail");
  assert.deepEqual(images.items, ["https://cdn.example/page — not an image (text/html)"]);
});

test("pre-flight network: never pointed at this machine or a private network", async () => {
  for (const h of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "box.internal"]) {
    assert.equal(isPrivateHost(h), true, h);
  }
  for (const h of ["hmarkconsultants.com", "8.8.8.8", "172.32.0.1", "fcbarcelona.com", "fd.example.com"]) assert.equal(isPrivateHost(h), false, h);
  let called = false;
  const checks = await networkPreflight(
    { links: [{ url: "http://169.254.169.254/latest/meta-data", text: "" }], images: [] },
    { fetchImpl: async () => ((called = true), new Response(null)) }
  );
  assert.equal(called, false, "the request is never made");
  assert.equal(checks[0].status, "fail");
});

// ------------------------------------------------------------------ preview

test("preview: nothing that could run survives, links open in a new tab, dark mode is added", () => {
  const dirty = '<html><head><style>p{color:red}</style></head><body><p onclick="x()">Hi</p><script>bad()</script><img src="javascript:x" onerror="y()"><a href="javascript:z()">a</a><a href="https://ok">b</a></body></html>';
  const clean = sanitizeEmailHtml(dirty);
  assert.ok(!/onclick|onerror|<script|javascript:/i.test(clean), clean);
  assert.ok(clean.includes("<style>p{color:red}</style>"), "the email's own styles stay");
  assert.ok(clean.includes('href="https://ok"'));
  const page = previewDocument(dirty, { dark: true });
  assert.match(page, /<head><base target="_blank"><style data-preview-dark>/);
  assert.ok(!previewDocument("<p>x</p>").includes("data-preview-dark"));
});

test("links and images are read back from a stored email for a re-check", () => {
  const r = linksAndImages('<a href="https://a.example">A</a><a href="https://a.example">again</a><a href="{{unsubscribe_url}}">u</a><img src="https://i/x.png" alt="x">');
  assert.deepEqual(r.links, [{ url: "https://a.example", text: "A" }]);
  assert.deepEqual(r.images, [{ src: "https://i/x.png", alt: "x" }]);
});
