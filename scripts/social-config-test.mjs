import { test } from "node:test";
import assert from "node:assert/strict";
import { socialSandboxMode, getProvider, providerForAccount } from "../src/lib/social/registry.ts";

const clearEnv = () => {
  for (const k of ["SOCIAL_LIVE", "META_APP_ID", "META_APP_SECRET", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "SNAPCHAT_CLIENT_ID", "SNAPCHAT_CLIENT_SECRET"]) delete process.env[k];
};

test("sandbox is the default and every platform is the mock", () => {
  clearEnv();
  assert.equal(socialSandboxMode(), true);
  for (const p of ["facebook", "instagram", "threads", "linkedin", "tiktok", "snapchat"]) {
    assert.match(getProvider(p).getAuthUrl("s", "https://x/cb"), /mock=1/, `${p} should be mock`);
  }
});

test("live mode uses the real provider only for a configured platform", () => {
  clearEnv();
  process.env.SOCIAL_LIVE = "yes";
  // Nothing configured yet → still mock.
  assert.match(getProvider("facebook").getAuthUrl("s", "https://x/cb"), /mock=1/);

  process.env.META_APP_ID = "APPID";
  process.env.META_APP_SECRET = "SECRET";
  const fb = getProvider("facebook");
  assert.equal(fb.configured, true);
  const url = fb.getAuthUrl("mystate", "https://x/cb");
  assert.match(url, /facebook\.com\/v21\.0\/dialog\/oauth/);
  assert.match(url, /client_id=APPID/);
  assert.match(url, /state=mystate/);
  // Threads shares the Meta app but its own OAuth host.
  assert.match(getProvider("threads").getAuthUrl("s", "https://x/cb"), /threads\.net\/oauth\/authorize/);
  // LinkedIn still unconfigured → mock; once configured → real.
  assert.match(getProvider("linkedin").getAuthUrl("s", "https://x/cb"), /mock=1/);
  process.env.LINKEDIN_CLIENT_ID = "LI";
  process.env.LINKEDIN_CLIENT_SECRET = "LS";
  assert.match(getProvider("linkedin").getAuthUrl("s", "https://x/cb"), /linkedin\.com\/oauth\/v2\/authorization/);
  clearEnv();
});

test("a sandbox account keeps using the mock even when its platform is live", () => {
  clearEnv();
  process.env.SOCIAL_LIVE = "yes";
  process.env.META_APP_ID = "A";
  process.env.META_APP_SECRET = "B";
  assert.match(providerForAccount({ platform: "facebook", is_mock: true }).getAuthUrl("s", "https://x/cb"), /mock=1/);
  assert.doesNotMatch(providerForAccount({ platform: "facebook", is_mock: false }).getAuthUrl("s", "https://x/cb"), /mock=1/);
  clearEnv();
});
