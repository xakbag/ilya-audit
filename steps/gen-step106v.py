#!/usr/bin/env python3
# Генератор steps/step106v-rates-update.run.sh: шаблон + режим + rates.py (gzip+base64), sha256 rates.json для сверки.
# python steps/gen-step106v.py --dry-run|--apply|--rollback
import base64, gzip, hashlib, pathlib, sys
mode = sys.argv[1]
assert mode in ('--dry-run', '--apply', '--rollback')
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / 'steps/step106v-rates-update.sh').read_text(encoding='utf-8')
b = (root / 'core-rates/rates.py').read_bytes().replace(b'\r\n', b'\n')
tpl = tpl.replace('__RATES_PY_SHA__', hashlib.sha256(b).hexdigest())
j = (root / 'core-rates/rates.json').read_bytes()
tpl = tpl.replace('__RATES_JSON_SHA__', hashlib.sha256(j).hexdigest())
out = ['set -- ' + mode, "RATES_PY_B64='%s'" % base64.b64encode(gzip.compress(b, 9, mtime=0)).decode()]
dst = root / 'steps/step106v-rates-update.run.sh'
dst.write_text('\n'.join(out) + '\n' + tpl, encoding='utf-8', newline='\n')
print(dst, dst.stat().st_size, 'rates.py sha', hashlib.sha256(b).hexdigest())
