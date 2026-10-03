"""Включает форму во фронте granitline.ru: в чанке 548-*.js флаг L=!1 -> L=!0.
Использование: python patch_chunk.py <вход.js> <выход.js>
Проверяет, что флаг встречается ровно один раз и что меняется только он."""
import sys
from pathlib import Path

OLD = '.com",L=!1;'
NEW = '.com",L=!0;'

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
data = src.read_text(encoding="utf-8")
if data.count(OLD) != 1:
    sys.exit(f"ожидалось 1 вхождение флага, найдено {data.count(OLD)}")
out = data.replace(OLD, NEW)
assert len(out) == len(data) and sum(a != b for a, b in zip(out, data)) == 1
dst.write_text(out, encoding="utf-8", newline="")
print("ok: изменён 1 символ, размер", len(out))
