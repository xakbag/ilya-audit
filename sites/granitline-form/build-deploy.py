"""Собирает steps/step106-gl-form-deploy.run.sh: вставляет index.php (base64) в шаблон выкладки.
MODE/SENDER задаются аргументами: python build-deploy.py [apply SENDER@granitline.ru]"""
import base64, sys
from pathlib import Path
here = Path(__file__).parent
tpl = (here / "deploy.sh.tpl").read_text(encoding="utf-8")
b64 = base64.b64encode((here / "api/inquiries/index.php").read_bytes()).decode()
head = ""
if len(sys.argv) == 3 and sys.argv[1] == "apply" and sys.argv[2].endswith("@granitline.ru"):
    head = f"MODE=apply\nSENDER={sys.argv[2]}\n"
out = here.parents[1] / "steps/step106-gl-form-deploy.run.sh"
out.write_text(head + tpl.replace("__INDEX_PHP_BASE64__", b64), encoding="utf-8", newline="\n")
print("собрано:", out, "режим:", "apply" if head else "dry-run")
