# Stemmer fra Norddjurs

Borgerdeltagelsesplatform til Norddjurs Kommune til indsamling af borgerholdninger via tekst og lydoptagelser — til brug i budgetprocessen "Sammen om Norddjurs".

## Hvad er dette?

Platformen giver borgere mulighed for at besvare politiske spørgsmål via tekst eller kortlydsoptagelse (maks. 90 sek.). En lokal AI-model genererer automatisk opfølgningsspørgsmål baseret på borgerens svar og andre borgeres perspektiver.

Administratorer kan via et dashboard se besvarelser, køre AI-analyse (temaer, sentiment, citater), moderere indhold og eksportere data som CSV.

**Al databehandling foregår 100% lokalt på kommunens server — ingen data forlader netværket.**

## Funktioner

- Tekst- og lydbesvarelser med lokal talegenkendelses (dansk Røst v2)
- AI-opfølgningsspørgsmål via lokal Ollama (Qwen 14B)
- Sentimentanalyse med to danske BERT-modeller
- GDPR-compliance: samtykke, dataeksport, sletning og frysning
- Admin-dashboard med filtrering, moderation og CSV-eksport
- Borgerspørgsmål med godkendelsesflow

## Teknologi

| Lag | Teknologi |
|---|---|
| Frontend | React 19, Vite |
| Backend | FastAPI (Python 3.11+) |
| Database | SQLite (dev) / MS SQL Server (prod) |
| AI / LLM | Ollama — Qwen 14B (lokalt) |
| Talegenkendelses | CoRal Røst v2 wav2vec2 (lokalt) |
| Sentiment | DaNLP + AlexandraInst BERT (lokalt) |

## Kom i gang (lokal udvikling)

### Forudsætninger

- Python 3.11+
- Node.js 18+
- [Ollama](https://ollama.com) installeret og kørende

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # udfyld SECRET_KEY og øvrige variabler
python main.py
```

Første opstart opretter databasen, seeder testdata og printer et tilfældigt admin-kodeord i terminalen.

API docs: [http://localhost:8321/docs](http://localhost:8321/docs)

### Frontend

```bash
npm install
npm run dev
```

Åbn [http://localhost:5173](http://localhost:5173)

### AI-model (valgfrit til lokal udvikling)

```bash
ollama pull qwen3:8b
```

Uden Ollama virker alt undtagen AI-opfølgningsspørgsmål og analyse.

## Produktion

Se [SETUP.md](SETUP.md) for komplet produktionsopsætning med IIS, MS SQL Server, GPU og Ollama på Windows-server.

## Tests

```bash
cd backend
pytest
```

## Arkitektur

```
React Frontend (IIS → port 443)
        │
        ▼
FastAPI Backend (port 8321)
        │
   ┌────┴────┐
   │         │
MS SQL    Ollama + Røst v2
Server    (lokal GPU)
```

## Licens

MIT — se [LICENSE](LICENSE)
