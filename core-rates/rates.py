"""Таблица ставок Core и ответ по правилам (без LLM).

Правила:
  R1. Ставка ищется по ключу (объект, вид работ, единица). Единицы не смешиваются:
      руб/м² и руб/м — разные строки; вопрос про м² не отвечается ставкой за м.
  R2. Если для ключа есть несколько значений с одной (самой поздней) датой —
      это конфликт версий: показываются все версии с документом, выбор не делается.
  R3. Если самая поздняя дата одна — ответ по ней, более ранние версии упоминаются.
  R4. Нет объекта / вида работ / единицы — отказ с причиной (не угадываем).
  R5. Комплексная строка помечается в ответе (состав указан в строке).
Модель (если есть) только переформулирует поле "text", значения берутся из "values".
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

UNIT_ALIASES = {
    "м2": "м²", "м^2": "м²", "кв.м": "м²", "кв м": "м²", "квадрат": "м²", "м²": "м²",
    "пм": "м", "п.м": "м", "пог.м": "м", "погонный": "м", "м": "м",
    # B35c (предложение): единицы из rates.json, которые не распознавались
    "к-т": "к-т", "кт": "к-т", "комплект": "к-т",
    "ч/ч": "ч/ч", "чч": "ч/ч", "чел/ч": "ч/ч", "человеко-час": "ч/ч", "человеко-часы": "ч/ч",
    "раб": "раб", "работа": "раб",
    # B35c fix1: варианты с точкой на конце (в rates.json 24 строки «п.м.» — раньше отдельная единица от «м»)
    "п.м.": "м", "пог.м.": "м", "м.п.": "м", "мп": "м", "пог. м": "м", "погонный метр": "м",
    "кв.м.": "м²", "м.кв.": "м²", "кв. м": "м²", "квадратный метр": "м²",
}


def norm_unit(u: Optional[str]) -> Optional[str]:
    if u is None:
        return None
    k = u.strip().lower().replace(" ", " ")
    return UNIT_ALIASES.get(k, k)


def norm_object(o: str) -> str:
    s = o.strip().lower().replace("№", " ")
    return re.sub(r"\s+", " ", s).strip()


def norm_work(w: str) -> str:
    # B35c: завершающая точка (в rates.json встречается «…проемов.») не участвует в сравнении
    return re.sub(r"\s+", " ", w.strip().lower().replace("ё", "е")).strip().rstrip(".").strip()


@dataclass(frozen=True)
class Rate:
    object: str
    work: str
    unit: str
    value: float
    document: str
    version: str
    date: str  # ISO YYYY-MM-DD
    complex: bool = False
    composition: str = ""

    @property
    def key(self) -> tuple:
        return (norm_object(self.object), norm_work(self.work), norm_unit(self.unit))


@dataclass
class Answer:
    status: str  # ok | conflict | refuse
    reason: str = ""
    values: list = field(default_factory=list)  # список Rate
    text: str = ""

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "reason": self.reason,
            "values": [r.value for r in self.values],
            "unit": self.values[0].unit if self.values else None,
            "text": self.text,
        }


def _fmt(v: float) -> str:
    return f"{int(v)}" if float(v).is_integer() else f"{v}"


def _line(r: Rate) -> str:
    extra = f"; комплексная строка: {r.composition}" if r.complex else ""
    return f"{_fmt(r.value)} руб/{r.unit} — {r.document}, версия {r.version} от {r.date}{extra}"


class RateTable:
    def __init__(self, rates: list[Rate]):
        self.rates = list(rates)

    @classmethod
    def from_json(cls, path: str | Path) -> "RateTable":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        # B35c fix2: значения из актов приходят с хвостами float (3300.0000000000005) — до копеек
        return cls([Rate(**{**r, "value": round(float(r["value"]), 2)}) for r in data["rates"]])

    def objects(self) -> set:
        return {r.key[0] for r in self.rates}

    def answer(self, obj: str, work: str, unit: Optional[str] = None) -> Answer:
        o, w, u = norm_object(obj), norm_work(work), norm_unit(unit)
        by_obj = [r for r in self.rates if r.key[0] == o]
        if not by_obj:
            return Answer("refuse", "unknown_object", text=f"Нет ставок по объекту «{obj}».")
        by_work = [r for r in by_obj if r.key[1] == w]
        if not by_work:
            return Answer("refuse", "unknown_work",
                          text=f"По объекту «{obj}» нет вида работ «{work}».")
        units = sorted({r.key[2] for r in by_work})
        if u is None:
            if len(units) > 1:
                return Answer("refuse", "ambiguous_unit",
                              text=f"Уточните единицу: есть ставки за {', '.join(units)}.")
            u = units[0]
        cand = [r for r in by_work if r.key[2] == u]
        if not cand:
            return Answer("refuse", "unit_mismatch",
                          text=f"Ставки за {u} нет; есть только за {', '.join(units)}. "
                               f"Пересчёт между единицами не делается.")
        latest = max(r.date for r in cand)
        top = sorted([r for r in cand if r.date == latest], key=lambda r: (r.version, r.value))
        older = sorted([r for r in cand if r.date < latest], key=lambda r: r.date)
        if len({r.value for r in top}) > 1:
            text = (f"Конфликт версий ({obj}, {work}, руб/{u}): "
                    + "; ".join(_line(r) for r in top)
                    + ". Какая версия действует — решает владелец.")
            return Answer("conflict", "version_conflict", top, text)
        r = top[0]
        text = f"{obj}, {work}: {_line(r)}."
        if older:
            text += " Ранее: " + "; ".join(_line(x) for x in older) + "."
        return Answer("ok", "", [r], text)

    # --- разбор вопроса в свободной форме (простые правила, без модели) ---
    def parse(self, question: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
        q = norm_work(question.replace("№", " "))
        obj = None
        # «дом 10», «дому 10», «объекта 7»: падежное окончание отбрасывается
        m = re.search(r"\b(дом|объект)[а-я]*\s*(\d+)", q)
        if m:
            obj = f"{m.group(1)} {m.group(2)}"
        unit = None
        # B35c fix1: «кв. м», «м.кв», «квадратный метр», «м.п.», «мп», «метр погонный»
        if re.search(r"м²|м2|кв\.?\s?м|квадрат|\bм\.?\s?кв\b", q):
            unit = "м²"
        elif re.search(r"погонн|п\.?\s?м\b|пог\.?\s?м|за метр\b|руб/м\b|\bм\.?\s?п\b|\bмп\b", q):
            unit = "м"
        elif re.search(r"комплект|\bк-т\b", q):
            unit = "к-т"
        elif re.search(r"человеко-?час|\bч/ч\b|\bчел/ч", q):
            unit = "ч/ч"
        elif re.search(r"за работу\b|\bраб\b", q):
            unit = "раб"
        work = None
        works = sorted({r.key[1] for r in self.rates}, key=len, reverse=True)
        for w in works:
            if w in q:
                work = w
                break
        return obj, work, unit

    def ask(self, question: str, formulate: Optional[Callable[[str], str]] = None) -> Answer:
        obj, work, unit = self.parse(question)
        if obj is None:
            return Answer("refuse", "no_object", text="В вопросе не указан объект.")
        if work is None:
            return Answer("refuse", "unknown_work", text="Не распознан вид работ.")
        a = self.answer(obj, work, unit)
        if formulate is not None:
            # модель только меняет формулировку; значения и статус не трогает
            a.text = formulate(a.text)
        return a
