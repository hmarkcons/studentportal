#!/bin/sh
# Regression tests for .githooks/pre-commit.
#
#   sh scripts/verify-hook.sh        (or: npm run check:hook)
#
# Run this after changing the hook. It exists because the hook broke silently
# once already: the pathspecs deciding which files to lint and whether to build
# were held in a variable and passed unquoted, so the shell expanded them before
# git saw them and eslint and the build were skipped for .ts and .mjs files. The
# gate went on reporting success while checking almost nothing, and two commits
# shipped that way. Nothing catches that except exercising the hook.
#
# So each file extension is checked on its own -- an earlier round of testing
# missed the bug by only ever staging .tsx, the one pattern that survived it --
# and every scenario asserts which checks actually ran, not merely the exit code.
#
# WHAT IT DOES TO THE REPO. It stages and unstages files, writes throwaway
# sources under src/ and scripts/, makes two temporary commits and resets them,
# and moves node_modules aside briefly to test the fresh-clone path. All of it
# is undone, and it refuses to start unless the working tree is clean, because
# `git reset --hard` in here would take uncommitted work with it.
#
# Takes a few minutes: several scenarios run a real production build.
cd "$(git rev-parse --show-toplevel)" || exit 1

if [ -n "$(git status --porcelain)" ]; then
  echo "verify-hook: the working tree is not clean."
  echo ""
  git status --short
  echo ""
  echo "This script stages, unstages, commits and resets --hard to exercise the"
  echo "hook, which would destroy the above. Commit or stash first."
  exit 1
fi

pass=0
fail=0
TMP=".hookverify"
OUT="$TMP/out.txt"
mkdir -p "$TMP"

ok() {
  if [ "$2" = "yes" ]; then pass=$((pass + 1)); printf 'PASS  %s\n' "$1"
  else fail=$((fail + 1)); printf 'FAIL  %s   %s\n' "$1" "$3"; fi
}
# Asserts a string is present / absent in the captured hook output.
saw()    { grep -qa -- "$2" "$OUT" && echo yes || echo no; }
notsaw() { grep -qa -- "$2" "$OUT" && echo no || echo yes; }

reset_stage() {
  git reset -q
  rm -rf "src/app/(staff)/zzhook" scratch/zzhook* scripts/zzhook-test.mjs src/lib/zzhook.ts src/lib/zzhook.mjs
  rm -f src/app/zzhook.css docs-zzhook.md
}

run_hook() {
  sh .githooks/pre-commit >"$OUT" 2>&1
  echo $?
}

echo "================ file-type detection ================"
# The bug was type-specific, so each extension is checked on its own.
for ext in ts tsx mjs; do
  reset_stage
  mkdir -p "src/app/(staff)/zzhook"
  case $ext in
    ts)  printf 'export const zzhook = 1;\n' > src/lib/zzhook.ts; f=src/lib/zzhook.ts ;;
    tsx) printf 'export default function Z() {\n  return <span>z</span>;\n}\n' > "src/app/(staff)/zzhook/page.tsx"; f="src/app/(staff)/zzhook/page.tsx" ;;
    mjs) printf 'export const zzhook = 1;\n' > src/lib/zzhook.mjs; f=src/lib/zzhook.mjs ;;
  esac
  git add -A -- src scripts >/dev/null 2>&1
  code=$(run_hook)
  ok ".$ext staged -> eslint runs"   "$(saw x 'eslint on')"          "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
  ok ".$ext staged -> build runs"    "$(saw x 'production build')"   "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
  ok ".$ext staged -> hook passes"   "$([ "$code" = 0 ] && echo yes || echo no)" "exit=$code"
done

# A stylesheet affects the build but eslint has nothing to say about it.
reset_stage
mkdir -p src/app
printf '.zzhook { color: red; }\n' > src/app/zzhook.css
git add -A -- src >/dev/null 2>&1
code=$(run_hook)
ok ".css staged -> eslint skipped"   "$(saw x 'no lintable files staged')" "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
ok ".css staged -> build still runs" "$(saw x 'production build')"         "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"

# Docs cannot break a build.
reset_stage
printf '# notes\n' > docs-zzhook.md
git add -A -- . >/dev/null 2>&1
code=$(run_hook)
ok ".md only -> eslint skipped" "$(saw x 'no lintable files staged')"               "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
ok ".md only -> build skipped"  "$(saw x 'nothing staged that affects the build')"  "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
ok ".md only -> hook passes"    "$([ "$code" = 0 ] && echo yes || echo no)"          "exit=$code"

echo "================ each check fails ================"
# A type error.
reset_stage
printf 'export const wrong: number = "no";\n' > src/lib/zzhook.ts
git add -A -- src >/dev/null 2>&1
code=$(run_hook)
ok "type error -> reports typecheck" "$(saw x 'failed -> typecheck')"          "$(grep -a 'failed ->' "$OUT")"
ok "type error -> build skipped"     "$(saw x 'skipping the build')"           "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
ok "type error -> exit 1"            "$([ "$code" = 1 ] && echo yes || echo no)" "exit=$code"

# An eslint error that is not a type error: setState inside an effect.
reset_stage
mkdir -p "src/app/(staff)/zzhook"
cat > "src/app/(staff)/zzhook/page.tsx" <<'TSX'
"use client";
import { useEffect, useState } from "react";
export default function Z() {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(1);
  }, []);
  return <span>{n}</span>;
}
TSX
git add -A -- src >/dev/null 2>&1
code=$(run_hook)
ok "lint error -> reports eslint"  "$(saw x 'failed -> eslint')"            "$(grep -a 'failed ->' "$OUT")"
ok "lint error -> build skipped"   "$(saw x 'skipping the build')"          "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
ok "lint error -> exit 1"          "$([ "$code" = 1 ] && echo yes || echo no)" "exit=$code"

# A failing unit test.
reset_stage
cat > scripts/zzhook-test.mjs <<'MJS'
import { test } from "node:test";
import assert from "node:assert/strict";
test("deliberately failing", () => { assert.equal(1, 2); });
MJS
git add -A -- scripts >/dev/null 2>&1
code=$(run_hook)
ok "test failure -> reports tests" "$(saw x 'failed -> tests')"             "$(grep -a 'failed ->' "$OUT")"
ok "test failure -> build skipped" "$(saw x 'skipping the build')"          "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
ok "test failure -> exit 1"        "$([ "$code" = 1 ] && echo yes || echo no)" "exit=$code"

# All three at once.
reset_stage
printf 'export const wrong: number = "no";\n' > src/lib/zzhook.ts
mkdir -p "src/app/(staff)/zzhook"
cat > "src/app/(staff)/zzhook/page.tsx" <<'TSX'
"use client";
import { useEffect, useState } from "react";
export default function Z() {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(1);
  }, []);
  return <span>{n}</span>;
}
TSX
cat > scripts/zzhook-test.mjs <<'MJS'
import { test } from "node:test";
import assert from "node:assert/strict";
test("deliberately failing", () => { assert.equal(1, 2); });
MJS
git add -A -- src scripts >/dev/null 2>&1
code=$(run_hook)
ok "all three fail -> all three named" "$(saw x 'failed -> typecheck eslint tests')" "$(grep -a 'failed ->' "$OUT")"

echo "================ build-only failure ================"
# Passes tsc, eslint and the tests; only the build rejects it. This is the
# whole justification for the build being in the gate.
reset_stage
mkdir -p "src/app/(staff)/zzhook"
cat > "src/app/(staff)/zzhook/page.tsx" <<'TSX'
"use client";
import { cookies } from "next/headers";
export default function Z() {
  return <span>{String(cookies())}</span>;
}
TSX
git add -A -- src >/dev/null 2>&1
code=$(run_hook)
ok "build-only fault -> typecheck passed" "$(notsaw x 'failed -> typecheck')" ""
ok "build-only fault -> reports build"    "$(saw x 'failed -> build')"        "$(grep -a 'failed ->' "$OUT")"
ok "build-only fault -> Next's reason shown" "$(saw x 'next/headers')"        ""
ok "build-only fault -> exit 1"           "$([ "$code" = 1 ] && echo yes || echo no)" "exit=$code"

echo "================ deletions and odd paths ================"
# --diff-filter=ACM must leave deletions out; eslint cannot read a path that is
# gone, and would exit non-zero if handed one.
reset_stage
printf 'export const zzhook = 1;\n' > src/lib/zzhook.ts
git add -A -- src >/dev/null 2>&1
git commit -q -m "zzhook: temporary, for verifying the hook" --no-verify
rm -f src/lib/zzhook.ts
git add -A -- src >/dev/null 2>&1
code=$(run_hook)
ok "a staged deletion is not linted" "$([ "$code" = 0 ] && echo yes || echo no)" "exit=$code $(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"
git reset -q --hard HEAD~1

# Parenthesised route-group directories must survive -z / xargs -0.
reset_stage
mkdir -p "src/app/(staff)/zzhook"
printf 'export default function Z() {\n  return <span>z</span>;\n}\n' > "src/app/(staff)/zzhook/page.tsx"
git add -A -- src >/dev/null 2>&1
code=$(run_hook)
ok "a path with parentheses is linted" "$(saw x 'eslint on 1 staged file')" "$(grep -a 'pre-commit:' "$OUT" | tr '\n' '|')"

echo "================ committing ================"
# Nothing must be committed when the gate fails, and --no-verify must still let
# a deliberate work-in-progress through.
reset_stage
before=$(git rev-parse HEAD)
printf 'export const wrong: number = "no";\n' > src/lib/zzhook.ts
git add -A -- src >/dev/null 2>&1
git commit -q -m "zzhook: must be refused" >"$OUT" 2>&1
after=$(git rev-parse HEAD)
ok "a failing gate commits nothing" "$([ "$before" = "$after" ] && echo yes || echo no)" "HEAD moved"

git commit -q -m "zzhook: bypassed deliberately" --no-verify >"$OUT" 2>&1
bypassed=$(git rev-parse HEAD)
ok "--no-verify still commits" "$([ "$before" != "$bypassed" ] && echo yes || echo no)" "HEAD did not move"
git reset -q --hard "$before"

echo "================ stale generated types ================"
# Deleting a route leaves .next/types/validator.ts importing a file that is
# gone. Unhandled, the typecheck fails, which skips the build, which never
# regenerates the validator -- a loop with no way out but a manual build.
reset_stage
mkdir -p "src/app/(staff)/zzhook"
printf 'export default function Z() {\n  return <span>z</span>;\n}\n' > "src/app/(staff)/zzhook/page.tsx"
npx next build >/dev/null 2>&1
stale=$(grep -c "zzhook" .next/types/validator.ts 2>/dev/null || echo 0)
rm -rf "src/app/(staff)/zzhook"
git add -A -- src >/dev/null 2>&1
code=$(run_hook)
ok "the validator had referenced the route" "$([ "$stale" -gt 0 ] && echo yes || echo no)" "refs=$stale"
ok "a deleted route does not wedge the gate" "$([ "$code" = 0 ] && echo yes || echo no)" "exit=$code $(grep -a 'error TS' "$OUT" | head -1)"

echo "================ missing node_modules ================"
# A fresh clone commits before its first install sometimes; that must not fail.
reset_stage
mv node_modules .node_modules_hookverify
code=$(run_hook)
mv .node_modules_hookverify node_modules
ok "no node_modules -> skips, does not fail" "$([ "$code" = 0 ] && echo yes || echo no)" "exit=$code"
ok "no node_modules -> says why"             "$(saw x 'node_modules is missing')"        "$(cat "$OUT")"

reset_stage
rm -rf "$TMP"
echo ""
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
