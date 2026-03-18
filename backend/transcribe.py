"""Transskribering med CoRal-projektets danske ASR-model (Røst v2 wav2vec2).

Modellen kører 100% lokalt — ingen data forlader serveren.
Første kørsel downloader modelfilerne (~1.2 GB) til lokal HuggingFace-cache.
"""

import os
import time
import numpy as np
import torch
import torchaudio
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


def transcribe_file(file_path: str) -> str:
    """Transskribér en lydfil og returnér teksten.

    Understøtter wav, mp3, webm/opus (kræver ffmpeg installeret).
    Resampler automatisk til 16kHz mono som modellen forventer.
    """
    pipe = _get_pipeline()

    print(f"Transskriberer: {file_path}")
    start = time.time()

    # Indlæs lyd via torchaudio (understøtter webm/opus hvis ffmpeg er installeret)
    waveform, sample_rate = torchaudio.load(file_path)

    # Stereo → mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # Resample til 16kHz hvis nødvendigt
    if sample_rate != TARGET_SAMPLE_RATE:
        resampler = torchaudio.transforms.Resample(
            orig_freq=sample_rate,
            new_freq=TARGET_SAMPLE_RATE,
        )
        waveform = resampler(waveform)

    # Konvertér til numpy float32 array (1D)
    audio_array = waveform.squeeze().numpy().astype(np.float32)

    result = pipe(
        {"array": audio_array, "sampling_rate": TARGET_SAMPLE_RATE},
    )

    text = result["text"].strip()
    elapsed = time.time() - start
    print(f"Færdig ({elapsed:.1f}s): \"{text[:80]}{'...' if len(text) > 80 else ''}\"")

    return text
