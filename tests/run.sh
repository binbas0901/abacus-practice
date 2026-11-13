#!/usr/bin/env bash
# Run every browser test against a local copy of the app. Usage: tests/run.sh [test names...]
cd "$(dirname "$0")/.." || exit 1
PORT="${PORT:-8765}"; export PORT
python3 -c "import urllib.request;urllib.request.urlopen('http://localhost:$PORT/index.html')" 2>/dev/null || { nohup python3 -m http.server "$PORT" >/dev/null 2>&1 & sleep 1; }
SUITES="${*:-p2_test p2_master p2_listen p2_myvoice p2_overlap p2_family p3_fun p3_treats p4_fix p5_setup p6_name p7_bix p8_ipad p9_boy p10_flash p11_kids}"
fail=0
for t in $SUITES; do
  out=$(timeout 400 python3 "tests/$t.py" 2>&1); code=$?
  bad=$(echo "$out" | grep -E "^FAIL|Traceback|Error:|errors: \[.+\]" | grep -v "errors: \[\]")
  if [ $code -ne 0 ] || [ -n "$bad" ]; then echo "✗ $t"; echo "$bad" | head -5 | sed 's/^/    /'; fail=1; else echo "✓ $t"; fi
done
exit $fail
