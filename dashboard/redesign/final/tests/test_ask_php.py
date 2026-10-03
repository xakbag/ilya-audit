"""Статическая проверка ask/api.php (PHP нет ни локально, ни на сервере) — B25.
Запуск: python -m unittest dashboard/redesign/final/tests/test_ask_php.py
"""
import re
import unittest
from pathlib import Path

SRC = (Path(__file__).resolve().parent.parent / "ask" / "api.php").read_text(encoding="utf-8")
CODE = re.sub(r"//[^\n]*|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"", "''", SRC)  # без строк и комментариев


def php_func(name: str) -> str:
    m = re.search(r"function %s\(.*?\n}\n" % name, SRC, re.S)
    assert m, name
    return m.group(0)


class TestApiPhp(unittest.TestCase):
    def test_balanced(self):
        for a, b in ("{}", "()", "[]"):
            self.assertEqual(CODE.count(a), CODE.count(b), a + b)
        self.assertTrue(SRC.startswith("<?php"))
        self.assertNotIn("?>", SRC)

    def test_server_endpoints_require_token(self):
        for fn in ("server_pull", "server_answer"):
            self.assertIn("server_auth();", php_func(fn), fn)
        auth = php_func("server_auth")
        self.assertIn("hash_equals", auth)
        self.assertIn("strlen($exp) < 32", auth)  # слабый/пустой токен не принимается
        self.assertIn("HTTP_X_ASK_TOKEN", auth)

    def test_token_and_data_outside_webroot(self):
        self.assertIn("dirname(__DIR__, 2) . '/ask-data'", SRC)
        self.assertIn("/token.txt", SRC)
        self.assertNotRegex(SRC, r"[A-Za-z0-9]{32,}")  # токен не зашит в код

    def test_invisible_ranges_match_spec(self):
        rx = re.search(r"preg_replace\('/\[(.*?)\]/u'", php_func("clean_text")).group(1)
        for r in ("200B}-\\x{200F", "202A}-\\x{202E", "2060}-\\x{2069", "FEFF"):
            self.assertIn(r, rx)
        self.assertIn("strip_tags", php_func("clean_text"))
        self.assertIn("<!--", php_func("clean_text"))

    def test_limits(self):
        self.assertIn("const MAX_LEN = 1000;", SRC)
        self.assertIn("const TTL = 2592000;", SRC)  # 30 суток
        q = php_func("post_question")
        self.assertIn("rate_check();", q)
        self.assertIn("cleanup();", q)
        self.assertIn("MAX_QUEUED", q)
        self.assertIn("random_bytes", q)
        self.assertIn("hash('sha256', client_ip())", php_func("rate_check"))  # IP не хранится открыто

    def test_ids_validated(self):
        for fn in ("get_answer", "server_answer"):
            self.assertIn("/^[a-f0-9]{16}$/", php_func(fn), fn)

    def test_public_view_hides_internal(self):
        v = php_func("public_view")
        self.assertNotIn("question", v.replace("'created_at'", ""))  # вопрос назад не отдаём
        self.assertNotIn("tries", v)
        self.assertNotIn("leased_at", v)

    def test_status_whitelist_and_lease(self):
        a = php_func("server_answer")
        self.assertIn("['answered', 'failed']", a)
        self.assertIn("MAX_ANSWER", a)
        t = php_func("take_next")
        self.assertIn("LEASE", t)
        self.assertIn("MAX_TRIES", t)
        self.assertIn("with_lock", t)

    def test_json_only_no_echo_of_input(self):
        self.assertEqual(SRC.count("echo "), 1)  # только в out()
        self.assertIn("Cache-Control: no-store", SRC)
        self.assertIn("display_errors', '0'", SRC)

    def test_htaccess_keeps_parent_auth(self):
        ht = (Path(__file__).resolve().parent.parent / "ask" / ".htaccess").read_text(encoding="utf-8")
        self.assertIn("Options -Indexes", ht)
        # Require в подкаталоге отменяет Basic-вход корня (факт хостинга 03.10)
        code = [l for l in ht.splitlines() if not l.lstrip().startswith("#")]
        self.assertFalse(any("Require" in l for l in code))


if __name__ == "__main__":
    unittest.main()
