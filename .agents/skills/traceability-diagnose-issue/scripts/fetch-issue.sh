#!/usr/bin/env bash
# Usage: fetch-issue.sh <issueId>
# Requires: traceability CLI installed and configured (traceability config set)
set -euo pipefail
ISSUE_ID="${1:?usage: fetch-issue.sh <issueId>}"
traceability issue show "$ISSUE_ID" --json
