# Генератор steps/step92-board-final-deploy.sh: выкладка dashboard/redesign/final на ai-ilya.ru (SFTP с сервера), .old-<дата>, автооткат.
import base64,sys,pathlib
src=pathlib.Path('dashboard/redesign/final')
files=['index.html','logic.js','monitor.js','styles.css','arch.js','arch.css','arch-data.json','sw.js','manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png']
old={'index.html':'index','monitor.js':'monitor'}
out=['set -u','main(){','. /etc/smart-monitor-publish.conf','U=https://ai-ilya.ru','R=www/ai-ilya.ru','TS=$(date +%Y%m%d-%H%M)','T=$(mktemp -d); cd "$T"',
'ls1(){ curl -s -o /dev/null -w "%{http_code}" -u 1:1 "$U/$1"; }',
'echo "до: / $(ls1 "")  monitor.js $(ls1 monitor.js)"']
for f in files:
    b=base64.b64encode((src/f).read_bytes()).decode()
    out.append(f"base64 -d > '{f}' <<'B64'\n{b}\nB64")
out.append('for f in index.html monitor.js; do curl -sS --netrc-file "$NETRC" -Q "-rename $R/$f $R/${f%.*}.old-$TS.${f##*.}" "$REMOTE_URL" -o /dev/null && echo "бэкап $f"; done')
out.append('FAIL=0')
out.append('for f in '+' '.join(files)+'; do curl -sS --fail --netrc-file "$NETRC" -T "$f" "${REMOTE_URL}$f" || { echo "ОШИБКА заливки $f"; FAIL=1; }; done')
out.append('sleep 3')
out.append('for f in "" index.html logic.js monitor.js styles.css arch.js arch.css arch-data.json sw.js manifest.webmanifest status.json; do c=$(ls1 "$f"); echo "$f $c"; [ "$c" = 200 ] || FAIL=1; done')
out.append('''if [ $FAIL = 0 ]; then echo "OK: доска D5a выложена, бэкап .old-$TS"; else
  echo "НЕ ОК -> откат"
  for f in index.html monitor.js; do curl -sS --netrc-file "$NETRC" -Q "-rename $R/${f%.*}.old-$TS.${f##*.} $R/$f" "$REMOTE_URL" -o /dev/null; done
  sleep 2; echo "после отката: / $(ls1 "") monitor.js $(ls1 monitor.js)"
fi
cd /; rm -rf "$T"
}
main </dev/null; exit 0''')
pathlib.Path('steps/step92-board-final-deploy.sh').write_text('\n'.join(out)+'\n',encoding='utf-8',newline='\n')
print('ok')
