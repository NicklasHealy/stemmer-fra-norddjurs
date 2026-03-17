# Stemmer fra Norddjus — Opsætningsguide (Produktion)

## Arkitektur

```
┌─────────────────────┐     ┌──────────────────────┐
│   React Frontend    │────▶│   FastAPI Backend     │
│   (Vite, port 5173) │     │   (Python, port 8321) │
└─────────────────────┘     └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   PostgreSQL          │
                            │   (port 5432)         │
                            └──────────────────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   Whisper (lokal)     │
                            │   + Anthropic API     │
                            └──────────────────────┘
```

## Forudsætninger

- Python 3.10+
- Node.js 18+
- PostgreSQL 15+

---

## 1. PostgreSQL

### Installér PostgreSQL

Download fra https://www.postgresql.org/download/windows/

### Opret database

Åbn SQL Shell (psql) eller pgAdmin og kør:

```sql
CREATE DATABASE norddjurs;
```

Hvis du bruger en anden bruger/password end `postgres/postgres`, 
opdatér `DATABASE_URL` i `.env` filen.

---

## 2. Backend

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
- `DATABASE_URL` — din PostgreSQL connection string
- `ANTHROPIC_API_KEY` — din API-nøgle fra console.anthropic.com
- `SECRET_KEY` — en lang, tilfældig streng (brug fx `python -c "import secrets; print(secrets.token_hex(32))"`)

### Start backend

```powershell
python main.py
```

Første gang:
- Opretter alle tabeller i PostgreSQL
- Seeder med temaer, spørgsmål og admin-bruger
- Downloader Whisper-modellen (~1.5 GB, kun første gang)

Du ser: `🗣️ Stemmer fra Norddjurs backend starter på http://0.0.0.0:8321`

API docs: http://localhost:8321/docs

### Standard admin-login
- Email: `admin@norddjurs.dk`
- Password: `norddjurs2025`

---

## 3. Frontend

### Installér afhængigheder

```powershell
cd stemmen-fra-norddjurs
npm install
```

### Start dev-server

```powershell
npm run dev
```

Frontend kører på http://localhost:5173

### Vigtigt: API base URL

I `src/App.jsx` skal alle API-kald pege på `http://localhost:8321`. 
Frontend'en skal opdateres til at bruge fetch() mod backend'en 
i stedet for `window.storage`.

---

## 4. Mappestruktur

```
stemmen-fra-norddjurs/
├── backend/
│   ├── main.py              ← FastAPI (alle endpoints)
│   ├── models.py            ← SQLAlchemy datamodel
│   ├── database.py          ← DB connection
│   ├── auth.py              ← JWT auth
│   ├── ai_service.py        ← Claude AI integration
│   ├── transcribe.py        ← Whisper transskribering
│   ├── requirements.txt
│   ├── .env.example
│   ├── .env                 ← DIN lokale config (git-ignorer denne)
│   └── uploads/             ← Lydoptagelser gemmes her
├── src/
│   ├── App.jsx              ← React app
│   └── main.jsx
├── package.json
└── README.md
```

---

## 5. API Endpoints (oversigt)

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

## 6. Næste skridt

1. **Opdatér React-frontend** til at bruge fetch() mod backend API'et
2. **Test borgerflowen** end-to-end
3. **Generér QR-koder** der peger på frontend-URL'en
4. **Deploy** — fx backend på en server med Docker, frontend på Vercel
