#!/usr/bin/env python3
# Генератор steps/step106-core-rates-route.run.sh: шаблон + режим + rates.py/rates.json (gzip+base64).
# python steps/gen-step106.py --dry-run|--apply|--rollback
import base64, gzip, hashlib, pathlib, sys
mode = sys.argv[1]
assert mode in ('--dry-run', '--apply', '--rollback')
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / 'steps/step106-core-rates-route.sh').read_text(encoding='utf-8')
out = ['set -- ' + mode]
for name, var in (('rates.py', 'RATES_PY'), ('rates.json', 'RATES_JSON')):
    b = (root / 'core-rates' / name).read_bytes()
    tpl = tpl.replace('__%s_SHA__' % var, hashlib.sha256(b).hexdigest())
    out.append("%s_B64='%s'" % (var, base64.b64encode(gzip.compress(b, 9, mtime=0)).decode()))
dst = root / 'steps/step106-core-rates-route.run.sh'
dst.write_text('\n'.join(out) + '\n' + tpl, encoding='utf-8', newline='\n')
print(dst, dst.stat().st_size)
