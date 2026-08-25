#!/usr/bin/env bash
# Creates the scratch project used by the manual QA suite.
# Usage: qa/scripts/scratch-init.sh [target-dir]   (default: ~/sdd-manual)
set -euo pipefail

SCRATCH="${1:-$HOME/sdd-manual}"

mkdir -p "$SCRATCH/src"
cat > "$SCRATCH/src/math.ts" <<'EOF'
export const add = (a: number, b: number): number => a + b;
EOF

cd "$SCRATCH"
git init -q
if ! git config user.email >/dev/null 2>&1; then
  git config user.name "QA Tester"
  git config user.email "qa@localhost"
fi

if [ ! -f package.json ]; then
  pnpm init >/dev/null
fi
pnpm add -D vitest >/dev/null

cat > .gitignore <<'EOF'
node_modules/
EOF

git add -A
git commit -q -m "chore: scaffold scratch project" || true

echo "Scratch project ready at: $SCRATCH"
echo "Next: qa/scripts/wire-opencode-config.sh $SCRATCH"
