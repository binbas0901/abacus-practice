#!/usr/bin/env bash
# Run the browser test suite against a local copy of the app. Usage: tests/run.sh [test names...]
# The default list below is the maintained suite (pre-redesign legacy tests were retired in Nov 2026;
# see git history if you need them). Each test reads PORT and connects to http://localhost:$PORT/index.html.
cd "$(dirname "$0")/.." || exit 1
PORT="${PORT:-8765}"; export PORT
python3 -c "import urllib.request;urllib.request.urlopen('http://localhost:$PORT/index.html')" 2>/dev/null || { nohup python3 -m http.server "$PORT" >/dev/null 2>&1 & sleep 1; }
SUITES="${*:-homeshot p10_flash p14_door p18_equals p23_juni p25_feed p26_bixcard p27_voiced p28_revive p2_listen p2_myvoice p30_doorgreet p31_anatomy p32_praise p33_back p34_gamelevel p35_stickerwait p36_levelmodel p38_practice_exit p39_practice_entry p3_fun p3_treats p41_placement_tool p42_timing p44_quickwin p45_shownumber p46_readteach p47_maketeach p48_drill_nofail p49_anzan_bridge p50_interludes p6_name}"
fail=0
for t in $SUITES; do
  out=$(timeout 400 python3 "tests/$t.py" 2>&1); code=$?
  bad=$(echo "$out" | grep -E "^FAIL|Traceback|Error:|errors: \[.+\]" | grep -v "errors: \[\]")
  if [ $code -ne 0 ] || [ -n "$bad" ]; then echo "✗ $t"; echo "$bad" | head -5 | sed 's/^/    /'; fail=1; else echo "✓ $t"; fi
done
exit $fail
