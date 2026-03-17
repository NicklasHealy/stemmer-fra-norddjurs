"""AI service: opfølgningsspørgsmål, analyse, sammenfatning via lokal Ollama."""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")

DEFAULT_SYSTEM_PROMPT = """Du er en venlig og nysgerrig samtalepartner i en borgerdialog for Norddjurs Kommune. Din opgave er at stille ét opfølgningsspørgsmål til en borger, der netop har delt sin holdning.

Regler:
- Stil KUN ét spørgsmål
- Spørgsmålet skal være åbent (ikke ja/nej)
- Brug et uformelt, venligt dansk
- Hold det kort (max 2 sætninger)
- Vær nysgerrig, ikke konfronterende
- Brug aldrig fagsprog eller politisk jargon"""


def _call_ollama(system_prompt: str, user_message: str, max_retries: int = 2) -> str | None:
    """Kald lokal Ollama API med chat-format."""
    for attempt in range(max_retries + 1):
        try:
            response = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 300,
                    },
                },
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()
            return result.get("message", {}).get("content", "").strip()
        except requests.exceptions.ConnectionError:
            if attempt == 0:
                print(f"Ollama ikke tilgængelig på {OLLAMA_URL} — er Ollama startet?")
            return None
        except Exception as e:
            print(f"Ollama fejl (forsøg {attempt + 1}): {e}")
            if attempt == max_retries:
                return None
    return None


def generate_followup(
    answer: str,
    question_text: str,
    theme_name: str,
    system_prompt: str = None,
    other_perspectives: list[str] = None,
    perspective_threshold: int = 30,
) -> str:
    """Generér ét AI-opfølgningsspørgsmål baseret på borgerens svar."""

    prompt = system_prompt or DEFAULT_SYSTEM_PROMPT

    perspective_block = ""
    if other_perspectives and len(other_perspectives) >= perspective_threshold:
        sample = other_perspectives[-20:]
        joined = "\n- ".join(sample)
        perspective_block = f"""

Du har også adgang til en sammenfatning af, hvad andre borgere har sagt om det samme emne. Brug det til at skabe dialog — fx: "Mange andre nævner X — hvad tænker du om det?" Men gør det naturligt, ikke som en quiz.

Andre borgeres perspektiver:
- {joined}"""

    user_message = f"""{perspective_block}

Borgerens svar:
{answer}

Tema: {theme_name}
Spørgsmål borgeren svarede på: {question_text}

Stil ét opfølgningsspørgsmål:"""

    result = _call_ollama(prompt, user_message)

    if result:
        # Rens output — fjern eventuelle "thinking" tags fra Qwen
        if "<think>" in result:
            result = result.split("</think>")[-1].strip()
        return result

    return "Kan du fortælle lidt mere om, hvad der ligger bag din holdning?"


def generate_analysis(responses_text: list[str], analysis_type: str) -> dict | list | None:
    """Kør AI-analyse på besvarelser (sentiment, themes, quotes)."""

    if not responses_text:
        return None

    sample = responses_text[-50:]
    numbered = "\n".join(f"{i+1}. {s}" for i, s in enumerate(sample))

    system_prompts = {
        "sentiment": "Du er en data-analytiker. Svar KUN med valid JSON, ingen anden tekst.",
        "themes": "Du er en data-analytiker. Svar KUN med valid JSON, ingen anden tekst.",
        "quotes": "Du er en data-analytiker. Svar KUN med valid JSON, ingen anden tekst.",
        "summary": "Du er en analytiker der skriver klart og præcist på dansk.",
    }

    user_prompts = {
        "sentiment": f'Analysér disse borgersvar og klassificér dem som positiv, neutral eller negativ. Svar KUN med JSON: {{"positiv": <antal>, "neutral": <antal>, "negativ": <antal>}}\n\nSvar:\n{numbered}',
        "themes": f'Identificér de 5 vigtigste temaer/emner i disse borgersvar. Svar KUN med JSON: [{{"tema": "...", "antal": <antal>}}, ...]\n\nSvar:\n{numbered}',
        "quotes": f'Udvælg de 3 mest repræsentative og stærke citater fra disse borgersvar. Svar KUN med JSON: [{{"citat": "...", "kontekst": "kort beskrivelse"}}]\n\nSvar:\n{numbered}',
        "summary": f'Sammenfat de vigtigste holdninger og temaer fra disse borgersvar. Strukturér det som 3-5 korte punkter. Skriv på dansk.\n\nSvar:\n{numbered}',
    }

    if analysis_type not in user_prompts:
        return None

    try:
        text = _call_ollama(system_prompts[analysis_type], user_prompts[analysis_type])

        if not text:
            return None

        # Rens thinking tags
        if "<think>" in text:
            text = text.split("</think>")[-1].strip()

        if analysis_type == "summary":
            return {"summary": text}

        # Parse JSON
        cleaned = text.replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned)

    except json.JSONDecodeError as e:
        print(f"AI analyse JSON-fejl: {e}")
        print(f"Rå output: {text[:200]}")
        return None
    except Exception as e:
        print(f"AI analyse fejl: {e}")
        return None


def check_ollama_health() -> dict:
    """Tjek om Ollama kører og modellen er tilgængelig."""
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        response.raise_for_status()
        models = [m["name"] for m in response.json().get("models", [])]
        model_loaded = any(OLLAMA_MODEL.split(":")[0] in m for m in models)
        return {
            "ollama": "ok",
            "url": OLLAMA_URL,
            "model": OLLAMA_MODEL,
            "model_available": model_loaded,
            "available_models": models,
        }
    except Exception as e:
        return {"ollama": "error", "message": str(e)}