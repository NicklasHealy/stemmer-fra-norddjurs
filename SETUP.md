# Stemmer fra Norddjurs — Opsætningsguide (Produktion)

> Denne guide er til IT-afdelingen (Mikael). Al software kører **lokalt på kommunens server** — ingen data forlader netværket.

## Arkitektur

```
┌─────────────────────┐     ┌──────────────────────┐
│   React Frontend    │────▶│   FastAPI Backend     │
│   (IIS → port 443)  │     │   (Python, port 8321) │
└─────────────────────┘     └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   MS SQL Server       │
                            │   (lokal, on-prem)    │
                            └──────────────────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   Ollama (Qwen 14B)   │
                            │   + Røst v2 (ASR)     │
                            │   — begge 100% lokale │
                            └──────────────────────┘
```

## Forudsætninger

- Python 3.11+
- Node.js 18+
- Microsoft SQL Server (eksisterende kommunal instans)
- NVIDIA GPU + CUDA drivers (RTX 4070 Ti anbefalet)
- [ffmpeg](https://ffmpeg.org/download.html) installeret og i PATH (til lyd-konvertering)
- Ollama installeret: https://ollama.com/download

---

## 1. Microsoft SQL Server

Brug kommunens eksisterende SQL Server-instans. Opret en dedikeret database:

```sql
CREATE DATABASE stemmer_fra_norddjurs;
```

Opret en SQL-bruger med rettigheder til databasen, eller brug Windows-autentificering via pyodbc.

---

## 2. Ollama (lokal AI)

### Installér Ollama

Download fra https://ollama.com/download og installér på serveren.

### Hent sprogmodellen

```powershell
ollama pull qwen3:14b
```

Modellen er ca. 9 GB. Kræver NVIDIA GPU med CUDA for acceptable svartider.

### Verificér at Ollama kører

```powershell
ollama list
```

Ollama starter automatisk som en Windows-service efter installation.

---

## 3. Transskriberings-model (Røst v2)

Modellen `CoRal-project/roest-wav2vec2-315m-v2` downloades automatisk første gang backend starter (~1.2 GB til HuggingFace-cache).

**Hvis serveren ikke har internetadgang**, skal modellen forhåndsdownloades:

```powershell
# Kør på en maskine med internet:
pip install huggingface_hub
huggingface-cli download CoRal-project/roest-wav2vec2-315m-v2 --local-dir C:\modeller\roest-v2
```

Kopier mappen til serveren og sæt i `.env`:

```
WHISPER_MODEL=C:\modeller\roest-v2
```

**Bemærk:** `kenlm` til sprog-modelpost-processing kan kræve manuel kompilering på Windows. Modellen fungerer uden det (lidt lavere nøjagtighed). Se `requirements.txt` for detaljer.

---

## 4. Backend

### Installér afhængigheder

```powershell
cd backend
pip install -r requirements.txt
```

### Opsæt miljøvariabler

```powershell
copy .env.example .env
```

Åbn `.env` og udfyld:

```env
DATABASE_URL=mssql+pyodbc://brugernavn:password@server/stemmer_fra_norddjurs?driver=ODBC+Driver+17+for+SQL+Server
SECRET_KEY=<lang tilfældig streng — generer med kommandoen nedenfor>
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:14b
WHISPER_MODEL=CoRal-project/roest-wav2vec2-315m-v2
```

Generer SECRET_KEY:
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

### Start backend

```powershell
python main.py
```

Første gang:
- Opretter alle tabeller i SQL Server
- Seeder med temaer, spørgsmål og admin-bruger
- Downloader Røst-modellen (~1.2 GB, kun første gang)

Du ser: `Stemmer fra Norddjurs backend starter på http://0.0.0.0:8321`

API docs: http://localhost:8321/docs

### Standard admin-login

- Email: `admin@norddjurs.dk`
- Password: `norddjurs2025`

**Skift password ved første login.**

---

## 5. Frontend

### Installér afhængigheder

```powershell
npm install
```

### Byg til produktion

```powershell
npm run build
```

Output placeres i `dist/` — denne mappe serveres via IIS.

### Dev-server (kun til test)

```powershell
npm run dev
```

Frontend kører på http://localhost:5173

---

## 6. IIS (produktion)

### Reverse proxy til backend

Installer `URL Rewrite` og `Application Request Routing` til IIS.

Tilføj følgende i `web.config` for at videresende `/api/*` til FastAPI:

```xml
<rule name="API Proxy" stopProcessing="true">
  <match url="^api/(.*)" />
  <action type="Rewrite" url="http://localhost:8321/api/{R:1}" />
</rule>
```

### NSSM — backend som Windows-service

Download NSSM fra https://nssm.cc/download

```powershell
nssm install StemmerFraNorddjurs python "C:\sti\til\backend\main.py"
nssm set StemmerFraNorddjurs AppDirectory "C:\sti\til\backend"
nssm start StemmerFraNorddjurs
```

---

## 7. Mappestruktur

```
STEMMER-FRA-NORDDJURS/
├── backend/
│   ├── main.py              ← FastAPI (alle endpoints)
│   ├── models.py            ← SQLAlchemy datamodel
│   ├── database.py          ← MS SQL Server connection
│   ├── auth.py              ← JWT auth
│   ├── ai_service.py        ← Ollama integration (Qwen 14B)
│   ├── transcribe.py        ← Røst v2 transskribering (lokal)
│   ├── requirements.txt
│   ├── .env.example
│   ├── .env                 ← Lokale credentials (IKKE i git)
│   └── uploads/             ← Lydoptagelser (midlertidigt)
├── src/
│   ├── App.jsx              ← React frontend
│   └── main.jsx
├── dist/                    ← React produktionsbuild (IIS)
├── package.json
├── SETUP.md                 ← Denne fil
└── CLAUDE.md                ← Udvikler-kontekst
```

---

## 8. API Endpoints (oversigt)

### Borger

| Method | Endpoint | Beskrivelse |
|--------|----------|-------------|
| POST | `/api/citizen/register` | Opret konto (email + kode) |
| POST | `/api/citizen/login` | Log ind |
| GET | `/api/citizen/me` | Hent profil + metadata |
| PUT | `/api/citizen/consent` | Giv/træk samtykke |
| PUT | `/api/citizen/metadata` | Opdatér alder/område/rolle |
| DELETE | `/api/citizen/delete-all` | GDPR: Slet alt |
| GET | `/api/citizen/responses` | Mine besvarelser |

### Offentlige

| Method | Endpoint | Beskrivelse |
|--------|----------|-------------|
| GET | `/api/themes` | Alle temaer |
| GET | `/api/themes/:id/questions` | Aktive spørgsmål i tema |
| POST | `/api/responses` | Indsend tekst-svar |
| POST | `/api/responses/audio` | Upload lyd + transskribér |
| POST | `/api/followup` | Generér AI-opfølgning |

### Admin

| Method | Endpoint | Beskrivelse |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/dashboard` | Dashboard-data |
| GET/POST/PUT | `/api/admin/questions` | CRUD spørgsmål |
| GET | `/api/admin/responses` | Alle svar (filtrering) |
| GET | `/api/admin/export/csv` | Eksportér CSV |
| POST | `/api/admin/analysis` | Kør AI-analyse |
| GET/PUT | `/api/admin/ai-settings` | AI-indstillinger |

---

## 9. Fejlfinding

**Ollama svarer ikke:**
```powershell
ollama list   # Tjek at service kører
# Er modellen hentet? Kør: ollama pull qwen3:14b
```

**Transskribering fejler:**
- Tjek at ffmpeg er i PATH: `ffmpeg -version`
- Tjek at GPU-drivere er opdaterede og CUDA virker: `python -c "import torch; print(torch.cuda.is_available())"`

**SQL Server connection fejler:**
- Tjek at ODBC Driver 17 for SQL Server er installeret
- Tjek `DATABASE_URL` i `.env`
