"""Transskribering med CoRal-projektets danske ASR-model (Røst v2 wav2vec2).

Modellen kører 100% lokalt — ingen data forlader serveren.
Første kørsel downloader modelfilerne (~1.2 GB) til lokal HuggingFace-cache.

Bruger PyAV til at dekode lyd — understøtter webm, mp3, wav, ogg osv.
uden at kræve ekstern ffmpeg-installation.
"""

import os
import time
import numpy as np
import torch
import av
from transformers import pipeline
from dotenv import load_dotenv

load_dotenv()

MODEL_ID = os.getenv("WHISPER_MODEL", "CoRal-project/roest-wav2vec2-315m-v2")
TARGET_SAMPLE_RATE = 16000

# Lazy loading — modellen indlæses først når den bruges
_pipe = None


def _get_pipeline():
    global _pipe
    if _pipe is not None:
        return _pipe

    print(f"Indlæser transskriberings-model: {MODEL_ID} ...")
    start = time.time()

    device = 0 if torch.cuda.is_available() else -1
    device_name = "GPU (CUDA)" if device == 0 else "CPU"

    _pipe = pipeline(
        "automatic-speech-recognition",
        model=MODEL_ID,
        device=device,
    )

    print(f"Model klar! ({time.time() - start:.1f}s, device={device_name})")
    return _pipe


def _load_audio(file_path: str) -> np.ndarray:
    """Indlæs lydfil og returnér 16kHz mono float32 numpy-array.

    Bruger PyAV (bundlet ffmpeg) — understøtter webm/opus, mp3, wav, ogg osv.
    """
    container = av.open(file_path)
    resampler = av.AudioResampler(
        format="fltp",    # float32 planar
        layout="mono",
        rate=TARGET_SAMPLE_RATE,
    )

    chunks = []
    for frame in container.decode(audio=0):
        frame.pts = None
        resampled = resampler.resample(frame)
        if resampled:
            frames = resampled if isinstance(resampled, list) else [resampled]
            for f in frames:
                chunks.append(f.to_ndarray()[0])

    # Flush resampler
    flushed = resampler.resample(None)
    if flushed:
        frames = flushed if isinstance(flushed, list) else [flushed]
        for f in frames:
            chunks.append(f.to_ndarray()[0])

    container.close()

    if not chunks:
        raise RuntimeError("Ingen lyd fundet i filen")

    return np.concatenate(chunks).astype(np.float32)


def transcribe_file(file_path: str) -> str:
    """Transskribér en lydfil og returnér teksten.

    Understøtter webm, mp3, wav, ogg og alle andre formater PyAV forstår.
    """
    pipe = _get_pipeline()

    print(f"Transskriberer: {file_path}")
    start = time.time()

    audio_array = _load_audio(file_path)

    result = pipe(
        {"array": audio_array, "sampling_rate": TARGET_SAMPLE_RATE},
    )

    text = result["text"].strip()
    elapsed = time.time() - start
    print(f"Færdig ({elapsed:.1f}s): \"{text[:80]}{'...' if len(text) > 80 else ''}\"")

    return text
