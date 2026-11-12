#!/bin/sh
# Pre-release check: every script must parse, engine tests must pass, and every file the page or offline cache needs must exist.
set -e
cd "$(dirname "$0")/.."
for f in *.js; do node -e "try{ new Function(require('fs').readFileSync('$f','utf8')); }catch(e){ console.error('SYNTAX ERROR in $f: '+e.message); process.exit(1) }"; done
node engine.test.js | tail -1 | grep -q " 0 failed" || { echo "engine tests failed"; exit 1; }
for f in $(grep -oE "(src|href)=\"[^\"?:]+\.(js|css|json|png)" index.html | sed 's/.*="//'); do [ -f "$f" ] || { echo "index.html references missing file: $f"; exit 1; }; done
for f in $(grep -oE "'\./[^'?]+" sw.js | sed "s/'\.\///"); do [ -z "$f" ] || [ -f "$f" ] || { echo "sw.js caches missing file: $f"; exit 1; }; done
echo "check ok"
