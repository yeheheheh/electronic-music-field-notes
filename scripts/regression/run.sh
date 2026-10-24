#!/bin/bash
# 全站回归：5 档宽度 × 15 条路由 × 2 种状态（收起 / 展开内嵌工作室）= 150 组合。
#
# 用法：
#   1. 先起本地服务   node scripts/serve.mjs
#   2. 再跑           ./scripts/regression/run.sh
#
# 判定三类问题：
#   BAD    横向溢出（docW 超视口，或元素右边界越界）
#   EMPTY  点了「在这里动手」但内嵌工作室没挂载出内容  ← 真实缺陷
#   NOOUT  探针没回话，通常是服务没起或 probe.html 被删
#   NOBTN  该路由本来就没有动手模块（预期，不是问题）
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CH="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PORT="${PORT:-5501}"
BASE="http://127.0.0.1:$PORT"
PROBE="$BASE/scripts/regression/probe.html"
UD="${TMPDIR:-/tmp}/cr-regression"
TMP="$(mktemp -d)"
LAST="$TMP/last.html"

ROUTES=(
  "" "studio" "studio?m=bass&from=kick-and-bass"
  "learn" "learn/kick-and-bass" "learn/drum-programming" "learn/daw-and-tracks"
  "learn/structure-eight" "learn/chord-progressions" "learn/synth-controls"
  "library" "atlas" "practice" "lab" "about"
)
WIDTHS=(320 390 768 1440 1920)

# 冒烟用：ROUTES_OVERRIDE="learn/kick-and-bass|library" WIDTHS_OVERRIDE="320 1920"
if [ -n "${ROUTES_OVERRIDE:-}" ]; then IFS='|' read -r -a ROUTES <<< "$ROUTES_OVERRIDE"; fi
if [ -n "${WIDTHS_OVERRIDE:-}" ]; then read -r -a WIDTHS <<< "$WIDTHS_OVERRIDE"; fi

if ! curl -s -o /dev/null "$BASE/index.html"; then
  echo "服务未启动：请先在仓库根目录运行  node scripts/serve.mjs" >&2
  exit 2
fi

for W in "${WIDTHS[@]}"; do
  for R in "${ROUTES[@]}"; do
    ENC=$(python -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$R")
    for OPEN in 0 1; do
      timeout 45 "$CH" --headless=new --disable-gpu --no-first-run \
        --user-data-dir="$UD" --virtual-time-budget=8000 \
        --window-size=2200,1300 --dump-dom \
        "$PROBE?w=$W&r=$ENC&open=$OPEN" 2>/dev/null > "$LAST"

      python - "$W" "$R" "$OPEN" "$LAST" <<'PY'
import json, re, sys
w, r, op, path = sys.argv[1], sys.argv[2] or '/', sys.argv[3], sys.argv[4]
src = open(path, encoding='utf-8', errors='replace').read()
m = re.search(r'RG::(\{.*?\})::END', src, re.S)
if not m:
    print(f'NOOUT {w} {r} open={op}')
    raise SystemExit
d = json.loads(m.group(1))
if d['docW'] > d['vw'] or d['over']:
    print(f"BAD w={w} r={r} open={op} docW={d['docW']} vw={d['vw']} over={d['over']}")
if op == '1' and d.get('open') == 1 and d.get('hasBtn') == 1 and not d.get('content'):
    print(f'EMPTY w={w} r={r} 内嵌工作室未挂载')
if op == '1' and d.get('open') == 'nobtn':
    print(f'NOBTN w={w} r={r} 该路由无动手模块（预期）')
PY
    done
  done
done

# 临时目录留在系统 temp 下，交给系统回收；此处不做删除，
# 避免与沙箱的路径保护规则冲突（会打印 SAFE_DELETE_INVALID_PATH 噪音）。
echo REG_DONE
