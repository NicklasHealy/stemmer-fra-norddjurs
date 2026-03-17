"""Transskribering med Alexandra Instituttets danske Whisper-model."""

import os
import time
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
from dotenv import load_dotenv

load_dotenv()

MODEL_ID = os.getenv("WHISPER_MODEL", "alexandrainst/whisper-medium-danish")

# Lazy loading — modellen indlæses først når den bruges
_pipe = None


def _get_pipeline():
    global _pipe
    if _pipe is not None:
        return _pipe

    print(f"Indlæser Whisper-model: {MODEL_ID} ...")
    start = time.time()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if device == "cuda" else torch.float32

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_ID,
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
    )
    model.to(device)

    processor = AutoProcessor.from_pretrained(MODEL_ID)

    _pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=torch_dtype,
        device=device,
        chunk_length_s=30,
        batch_size=1,
    )

    print(f"Whisper klar! ({time.time() - start:.1f}s, device={device})")
    return _pipe


def transcribe_file(file_path: str) -> str:
    """Transskribér en lydfil og returnér teksten."""
    pipe = _get_pipeline()

    print(f"Transskriberer: {file_path}")
    start = time.time()

    result = pipe(
        file_path,
        generate_kwargs={"language": "danish", "task": "transcribe"},
        return_timestamps=False,
    )

    text = result["text"].strip()
    elapsed = time.time() - start
    print(f"Færdig ({elapsed:.1f}s): \"{text[:80]}{'...' if len(text) > 80 else ''}\"")

    return text
