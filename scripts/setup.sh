#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="${SEMANTIC_HTML_HOME:-$HOME/.config/opencode/skills/semantic-html}"

echo "==> Setting up semantic-html skill environment..."

# Create venv with uv (fast) or fallback to python3 -m venv
if command -v uv &>/dev/null; then
    echo "  Using uv..."
    uv venv "$SKILL_DIR/.venv"
    uv pip install --python "$SKILL_DIR/.venv/bin/python" -r "$SKILL_DIR/scripts/requirements.txt"
else
    echo "  uv not found, using python3 -m venv..."
    python3 -m venv "$SKILL_DIR/.venv"
    "$SKILL_DIR/.venv/bin/pip" install -r "$SKILL_DIR/scripts/requirements.txt"
fi

echo "==> Ingesting MDN content if needed (idempotent; skips if index exists)..."
"$SKILL_DIR/.venv/bin/python" "$SKILL_DIR/scripts/ingest_mdn.py"

echo "==> Setup complete. Try a query:"
echo "    $SKILL_DIR/.venv/bin/python $SKILL_DIR/scripts/ingest_mdn.py --query 'semantic html elements'"
echo ""
echo "==> To register the MCP server (Claude Code):"
echo "    claude mcp add mdn-search -- $SKILL_DIR/.venv/bin/python $SKILL_DIR/scripts/mcp_server.py"
