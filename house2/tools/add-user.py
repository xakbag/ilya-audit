#!/usr/bin/env python3
"""
Генератор bcrypt-хэша для пользователей house2.
Использование: python house2/tools/add-user.py <password> <role>
Роли: admin, editor, viewer
Вывод: JSON-строка для вставки в USERS api.php
"""
import sys

roles = ['admin', 'editor', 'viewer']
if len(sys.argv) < 3 or sys.argv[2] not in roles:
    print(f"Usage: {sys.argv[0]} <password> <role>", file=sys.stderr)
    print(f"Roles: {', '.join(roles)}", file=sys.stderr)
    print(f"\nExample: python {sys.argv[0]} mypass123 editor", file=sys.stderr)
    sys.exit(1)

try:
    import bcrypt
except ImportError:
    print("ERROR: bcrypt не установлен. Установите: pip install bcrypt", file=sys.stderr)
    print("\nАльтернатива: запустить PHP напрямую:", file=sys.stderr)
    print(f'  php -r "echo password_hash(\'{sys.argv[1]}\', PASSWORD_DEFAULT);"', file=sys.stderr)
    sys.exit(2)

password = sys.argv[1].encode('utf-8')
role = sys.argv[2]
salt = bcrypt.gensalt(rounds=12)
hashed = bcrypt.hashpw(password, salt).decode('utf-8')

import json
print(json.dumps({'hash': hashed, 'role': role}, ensure_ascii=False))
print(f"\n# Вставить в api.php USERS:", file=sys.stderr)
print(f"  'login' => ['hash' => '{hashed}', 'role' => '{role}'],", file=sys.stderr)
