# B35d: делает steps/step106v-rates-update.sh и steps/gen-step106v.py из шаблона step106u (только rates.py, core.py не меняется)
from pathlib import Path
root = Path(__file__).resolve().parent.parent
s = (root / 'steps/step106u-rates-update.sh').read_text(encoding='utf-8')


def r(a, b, n=1):
    global s
    assert s.count(a) == n, (a, s.count(a))
    s = s.replace(a, b)


r("# step106u (B35c): обновление rates.py в Core + одна строка врезки (уточнение clarify показывается, а не уходит в knowledge).",
  "# step106v (B35d): повтор step106u — только rates.py (синонимы видов работ); core.py уже с врезкой B35c и не меняется.")
r("# Шаблон; запускать steps/step106u-rates-update.run.sh (python steps/gen-step106u.py <режим>).",
  "# Шаблон; запускать steps/step106v-rates-update.run.sh (python steps/gen-step106v.py <режим>).")
r("# Флаг CORE_RATES_ROUTE не меняется (остаётся off).", "# Флаг CORE_RATES_ROUTE не меняется (остаётся on).")
r("STATE=/var/backups/step106u-last", "STATE=/var/backups/step106v-last")
r("CORE_SHA_EXPECTED=84b57aebd88b77e3fd3cab11e55c6670e362cc0f035863a496bac0b606c9652c",
  "CORE_SHA_EXPECTED=c3cc117251e8121dfc7fdcf905100d562001dc9a85b87fcc5f7058c7d1a8ad9f")
r("if new in t: print('ALREADY_PATCHED'); sys.exit(3)",
  "if new in t:\n    open(dst, 'w', encoding='utf-8', newline='').write(t); print('ALREADY_PATCHED_COPY_OK'); sys.exit(0)")
r("exp = {'A': [3500, 4000], 'B': [3500, 4000], 'C': [1700, 2000]}",
  "exp = {'A': [3500, 4000], 'B': [3500, 4000], 'C': [1700, 2000], 'D': [3500]}")
r(".bak-u-", ".bak-v-", n=s.count(".bak-u-"))
(root / 'steps/step106v-rates-update.sh').write_text(s, encoding='utf-8', newline='\n')
g = (root / 'steps/gen-step106u.py').read_text(encoding='utf-8').replace('step106u', 'step106v')
(root / 'steps/gen-step106v.py').write_text(g, encoding='utf-8')
print('OK')
