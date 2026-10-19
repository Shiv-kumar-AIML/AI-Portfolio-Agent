"""Okapi BM25 over the chunk corpus — the lexical half of hybrid retrieval.

Small enough to own outright (a dependency would buy nothing at this corpus size), and it catches
what embeddings blur: exact names, library names, acronyms ("XGBoost", "pgvector", "RRF").
"""

import math
import re
from collections import Counter

_TOKEN = re.compile(r"[a-z0-9]+(?:[.+#][a-z0-9]+)*")
_STOPWORDS = frozenset(
    "a an and are as at be but by do does did for from has have he her him his how i in is it its "
    "me my of on or our she so that the their them they this to was we were what when where which "
    "who why will with you your about tell can could would should".split()
)


def _stem(token: str) -> str:
    """Very light suffix stripping so "projects"/"project" and "deployed"/"deploy" meet."""
    for suffix, replacement in (
        ("ies", "y"),
        ("ied", "y"),
        ("es", ""),
        ("s", ""),
        ("ing", ""),
        ("ed", ""),
    ):
        if len(token) > len(suffix) + 2 and token.endswith(suffix):
            return token[: -len(suffix)] + replacement
    return token


def tokenize(text: str) -> list[str]:
    return [_stem(t) for t in _TOKEN.findall(text.lower()) if t not in _STOPWORDS]


class BM25:
    def __init__(self, documents: list[str], k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b
        self._docs = [Counter(tokenize(d)) for d in documents]
        self._lengths = [sum(c.values()) for c in self._docs]
        self._avg_len = (sum(self._lengths) / len(self._lengths)) if self._lengths else 0.0
        df: Counter[str] = Counter()
        for counts in self._docs:
            df.update(counts.keys())
        n = len(self._docs)
        self._idf = {
            term: math.log(1 + (n - freq + 0.5) / (freq + 0.5)) for term, freq in df.items()
        }

    def scores(self, query: str) -> list[float]:
        terms = tokenize(query)
        out: list[float] = []
        for counts, length in zip(self._docs, self._lengths, strict=True):
            score = 0.0
            norm = self.k1 * (1 - self.b + self.b * length / (self._avg_len or 1.0))
            for term in terms:
                tf = counts.get(term, 0)
                if tf:
                    score += self._idf[term] * tf * (self.k1 + 1) / (tf + norm)
            out.append(score)
        return out
