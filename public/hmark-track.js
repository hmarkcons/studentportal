/*
 * HMARK email campaign tracking for hmarkconsultants.com.
 *
 * Add once, before </body>, on every page of the website:
 *   <script src="https://portal.hmarkconsultants.com/hmark-track.js" defer></script>
 *
 * A campaign's links to the website carry hm_rid (the recipient's private
 * token). This script keeps it in a first-party cookie for 30 days and reports
 * each page view to the portal, so a campaign's report shows who visited and
 * what they read. Report a conversion where it happens:
 *   hmarkTrack('conversion', 'enquiry_form');     // after the enquiry form is sent
 *   hmarkTrack('conversion', 'whatsapp_click');   // on the WhatsApp button
 *   hmarkTrack('conversion', 'book_consultation');
 *   hmarkTrack('conversion', 'apply_now');
 * Someone who did not come from a campaign is not tracked at all.
 */
(function () {
  var ENDPOINT = "https://portal.hmarkconsultants.com/api/email/web-event";
  var KEY = "hm_rid";
  var TOKEN = /^[0-9a-f]{32}$/;
  var rid = null;
  try {
    var m = new RegExp("[?&]" + KEY + "=([0-9a-f]{32})").exec(window.location.search);
    if (m) {
      rid = m[1];
      document.cookie = KEY + "=" + rid + "; path=/; max-age=" + 60 * 60 * 24 * 30 + "; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    } else {
      var c = /(?:^|;\s*)hm_rid=([0-9a-f]{32})/.exec(document.cookie);
      rid = c ? c[1] : null;
    }
  } catch (_e) {
    rid = null;
  }
  var sid = null;
  try {
    sid = window.sessionStorage.getItem("hm_sid");
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem("hm_sid", sid);
    }
  } catch (_e) {
    sid = Math.random().toString(36).slice(2);
  }

  function send(type, name) {
    if (!rid || !TOKEN.test(rid)) return;
    var body = JSON.stringify({ rid: rid, sid: sid, type: type, name: name || null, url: window.location.href, ref: document.referrer || null });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    } catch (_e) {
      /* fall through to fetch */
    }
    try {
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, mode: "cors", headers: { "Content-Type": "text/plain" } });
    } catch (_e) {
      /* tracking never breaks the page */
    }
  }

  window.hmarkTrack = function (kind, name) {
    if (kind === "conversion" && typeof name === "string") send("conversion", name);
  };
  send("page_view");
})();
