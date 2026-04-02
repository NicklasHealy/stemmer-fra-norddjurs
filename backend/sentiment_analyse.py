"""
Lokal dansk sentiment-analyse med to BERT-modeller.

Modeller:
  A: DaNLP/da-bert-tone-sentiment-polarity
  B: alexandrainst/da-sentiment-da

Returnerer et kombineret score (-1.0 til 1.0), label og enighed.
Modellerne indlæses lazy (ved første kald) og caches i hukommelsen.
"""

import threading

_lock = threading.Lock()
_pipeline_a = None  # DaNLP/da-bert-tone-sentiment-polarity
_pipeline_b = None  # alexandrainst/da-sentiment-da


def _load_models():
    global _pipeline_a, _pipeline_b
    with _lock:
        if _pipeline_a is None or _pipeline_b is None:
            from transformers import pipeline as hf_pipeline
            if _pipeline_a is None:
                _pipeline_a = hf_pipeline(
                    "text-classification",
                    model="DaNLP/da-bert-tone-sentiment-polarity",
                    truncation=True,
                    max_length=512,
                )
            if _pipeline_b is None:
                _pipeline_b = hf_pipeline(
                    "text-classification",
                    model="alexandrainst/da-sentiment-da",
                    truncation=True,
                    max_length=512,
                )


def _normalize_label(raw: str) -> str:
    """Normalisér modeloutput til positiv/neutral/negativ."""
    raw = raw.lower()
    if any(x in raw for x in ("positiv", "positive", "pos")):
        return "positiv"
    if any(x in raw for x in ("negativ", "negative", "neg")):
        return "negativ"
    return "neutral"


def _label_to_score(label: str) -> float:
    return {"positiv": 1.0, "neutral": 0.0, "negativ": -1.0}[label]


def analysér_sentiment(text: str) -> dict:
    """
    Analysér sentiment i dansk fritekst med to lokale BERT-modeller.

    Returnerer:
        {
            "score": float,   # vægtet gennemsnit, -1.0 (negativ) til 1.0 (positiv)
            "label": str,     # "positiv" | "neutral" | "negativ"
            "enighed": bool,  # True hvis begge modeller giver samme label
        }
    """
    if not text or not text.strip():
        return {"score": 0.0, "label": "neutral", "enighed": True}

    try:
        _load_models()

        res_a = _pipeline_a(text[:1000])[0]
        res_b = _pipeline_b(text[:1000])[0]

        label_a = _normalize_label(res_a["label"])
        label_b = _normalize_label(res_b["label"])

        # Vægtet score: modelkonfidensen ganges på retningsscore
        score_a = _label_to_score(label_a) * res_a["score"]
        score_b = _label_to_score(label_b) * res_b["score"]
        combined = (score_a + score_b) / 2

        if combined > 0.15:
            label = "positiv"
        elif combined < -0.15:
            label = "negativ"
        else:
            label = "neutral"

        enighed = label_a == label_b

        return {
            "score": round(combined, 4),
            "label": label,
            "enighed": enighed,
        }

    except Exception as e:
        print(f"Sentiment analyse fejl: {e}")
        return {"score": 0.0, "label": "neutral", "enighed": True}
