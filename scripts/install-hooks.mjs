// Points git at the repo's committed hooks, so the pre-commit gate arrives
// with a clone rather than having to be set up by hand.
//
// Run by npm's `prepare` lifecycle after every install. That means it must
// never fail the install: a build environment may have no git repository, or a
// git that refuses to be configured, and neither is a reason to stop a deploy.
// Hence a node script rather than an inline `git config ... || true`, which
// behaves differently between sh and cmd.exe.
//
// Deliberately no husky: this is one `git config` call, and husky would add a
// dependency plus its own install script to approve.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const HOOKS_DIR = ".githooks";

// Nothing in a build or CI environment commits anything, so there is nothing
// to gate and no reason to touch its git config.
if (process.env.CI || process.env.VERCEL || process.env.GITHUB_ACTIONS) {
  process.exit(0);
}

if (!existsSync(".git") || !existsSync(HOOKS_DIR)) {
  // Installed as a dependency, or a git-less export. Not an error.
  process.exit(0);
}

try {
  const current = execFileSync("git", ["config", "--get", "core.hooksPath"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (current === HOOKS_DIR) process.exit(0);
} catch {
  // Not set yet, which is the normal first-install case.
}

try {
  execFileSync("git", ["config", "core.hooksPath", HOOKS_DIR], { stdio: "ignore" });
  console.log(`Git hooks enabled from ${HOOKS_DIR}/ — unit tests now run on commit.`);
} catch {
  // A repo that will not take the setting still builds and runs perfectly
  // well; it just does not get the gate.
  console.log(`Could not set core.hooksPath; skipping the ${HOOKS_DIR}/ hooks.`);
}
