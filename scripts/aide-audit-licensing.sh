#!/usr/bin/env bash
set -euo pipefail

# NOTE: This is not legal advice. This script is an engineering guardrail.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

deny_patterns=(
"GitHub.copilot"
"GitHub.copilot-chat"
"aka.ms/github-copilot"
"copilot_internal"
)

targets=(
"$ROOT/product.json"
)

fail=0
for t in "${targets[@]}"; do
	for p in "${deny_patterns[@]}"; do
		if rg -n --hidden --no-ignore-vcs "$p" "$t" >/dev/null 2>&1; then
			echo "FOUND: pattern='$p' in $t" >&2
			fail=1
		fi
	done
done

if [[ "$fail" -ne 0 ]]; then
	echo "AIDE licensing audit FAILED." >&2
	exit 2
fi

echo "AIDE licensing audit OK."
