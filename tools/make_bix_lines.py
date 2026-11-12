"""Write audio/bix-lines.js (the text of every Bix line, for speech bubbles) from tools/bix_lines.json."""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
L = {k: v for k, v in json.load(open(os.path.join(here, 'bix_lines.json'))).items() if not k.startswith('_')}
open(os.path.join(here, '..', 'audio', 'bix-lines.js'), 'w').write('window.BIX_LINES = ' + json.dumps(L, ensure_ascii=False, indent=0) + ';\n')
print(len(L), 'lines')
