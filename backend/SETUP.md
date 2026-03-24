# SETUP.md — Deployment-guide for Stemmer fra Norddjurs

**Til:** Mikael (IT-ansvarlig)
**Projekt:** Stemmer fra Norddjurs — borgerdialogplatform
**Deadline:** 11. maj 2026

---

## Forudsætninger

| Komponent | Krav |
|-----------|------|
| OS | Windows Server 2019+ |
| Python | 3.11+ |
| Node.js | 18+ (kun til frontend-build) |
| SQL Server | 2019+ (lokal instans) |
| NVIDIA GPU | RTX 4070 Ti, 12 GB VRAM |
| RAM | 32 GB |
| Disk | 50 GB SSD |
| IIS | Version 10+ med ARR og URL Rewrite |

---

## 1. Klon projektet

```bash
git clone https://github.com/norddjurs/stemmer-fra-norddjurs.git
cd stemmer-fra-norddjurs
```

---

## 2. Backend-opsætning

### 2a. Installer Python-afhængigheder

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 2b. Konfigurér miljøvariabler

Kopiér `.env.example` til `.env` og udfyld:

```bash
copy .env.example .env
```

Rediger `.env`:

```env
# Database (SQL Server)
DATABASE_URL=mssql+pyodbc://brugernavn:adgangskode@SERVER\INSTANS/NorddjursDB?driver=ODBC+Driver+17+for+SQL+Server

# JWT (generér en lang tilfældig streng)
SECRET_KEY=skift-denne-til-en-lang-tilfaeldig-streng-mindst-32-tegn

# Ollama (kører lokalt)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:14b

# Lydoptagelser
UPLOAD_DIR=C:\inetpub\wwwroot\stemmer\uploads
```

**Vigtigt:** `.env` må ALDRIG committes til git.

### 2c. Opret SQL Server-database

I SQL Server Management Studio:

```sql
CREATE DATABASE NorddjursDB COLLATE Danish_Norwegian_CI_AS;
```

Opret en SQL-bruger med adgang til databasen, eller brug Windows-autentificering.

### 2d. Kør database-migration og seed

```bash
python main.py
```

Ved første start:
- `migrate_db()` opretter alle tabeller (inkl. `consent_logs`)
- `migrate_db()` tilføjer nye kolonner til eksisterende tabeller automatisk
- `seed_data()` indsætter temaer, spørgsmål, admin-bruger og moderationsregler

**Standardadmin ved seed:**
- Email: `admin@norddjurs.dk`
- Adgangskode: `norddjurs2025` — **skift denne straks efter første login!**

---

## 3. Ollama (lokal AI)

### 3a. Installer Ollama

Download fra [ollama.com](https://ollama.com) og installér på serveren.

### 3b. Download model

```bash
ollama pull qwen3:14b
```

Kræver ca. 9 GB diskplads. Modellen indlæses i GPU-hukommelse ved første kald.

### 3c. Start Ollama som service

Ollama starter automatisk som Windows-service efter installation.
Test: `curl http://localhost:11434/api/tags`

---

## 4. CoRal Røst v2 (transskribering)

Transskriberings-servicen kræver Python-pakken `transformers` og PyTorch med CUDA.

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install transformers
```

Modellen `CoRal-project/roest-wav2vec2-315m-v2` downloades automatisk ved første kald (~1.3 GB).
Kræver internet ved første opstart — herefter kører den 100% lokalt.

---

## 5. Frontend-build

```bash
# Fra projektets rodmappe
npm install
npm run build
```

Outputtet lægges i `dist/`-mappen.

---

## 6. IIS-konfiguration

### 6a. Opret website

1. Åbn IIS Manager
2. Opret nyt website: `stemmer.norddjurs.dk`
3. Peg physical path på `dist/`-mappen (frontend)
4. Binding: HTTPS port 443, SSL-certifikat fra Mikael/IT

### 6b. Installer URL Rewrite og ARR

Download fra Microsoft og installér begge moduler.

### 6c. Reverse proxy til FastAPI

Opret `web.config` i `dist/`-mappen:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- API-kald proxyes til FastAPI -->
        <rule name="API Proxy" stopProcessing="true">
          <match url="^api/(.*)" />
          <action type="Rewrite" url="http://localhost:8321/api/{R:1}" />
        </rule>
        <!-- SPA fallback for React Router -->
        <rule name="SPA Fallback" stopProcessing="true">
          <match url=".*" />
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

### 6d. Start FastAPI som Windows-service

Installer NSSM (Non-Sucking Service Manager):

```bash
nssm install StemmerFraNorddjurs "C:\sti\til\venv\Scripts\python.exe" "C:\sti\til\backend\main.py"
nssm set StemmerFraNorddjurs AppDirectory "C:\sti\til\backend"
nssm start StemmerFraNorddjurs
```

FastAPI lytter på `http://localhost:8321`.

---

## 7. Opdatering (deploy ny version)

```bash
git pull

# Frontend
npm install
npm run build

# Backend: genstart service
nssm restart StemmerFraNorddjurs
```

`migrate_db()` kører automatisk ved opstart og tilføjer eventuelle nye kolonner.

---

## 8. GDPR-relevante indstillinger

### Samtykke-version

Konstanten `CURRENT_CONSENT_VERSION` i `backend/main.py` styrer hvilken version af samtykketeksten der er aktuel.

**Hvis samtykketeksten ændres** (f.eks. ny opbevaringsperiode fastsat af DPO):
1. Rediger `PRIVACY_POLICY_TEXT` i `main.py`
2. Bump `CURRENT_CONSENT_VERSION` med 1
3. Genstart servicen

Borgere med ældre `consent_version` vil automatisk blive bedt om at re-acceptere næste gang de logger ind.

### Frys-funktionen

Borgere kan "fryse" deres data via profil-siden (GDPR art. 18). Frosne borgeres svar:
- Vises stadig for admins
- Ekskluderes fra dashboard-statistik, AI-analyse og CSV-eksport

### Sletning og dataeksport

Borgere kan:
- Downloade alle egne data som JSON (`GET /api/citizen/export`)
- Slette alle data permanent via "Træk samtykke tilbage" på profil-siden

### Samtykke-log

Alle samtykke-hændelser (givet/trukket tilbage) logges i `consent_logs`-tabellen med tidsstempel og IP-adresse. Se oversigten i admin-panelet under fanen **Samtykker**.

---

## 9. Checkliste inden go-live

- [ ] SQL Server-database oprettet og migreret
- [ ] `.env` udfyldt med produktions-hemmeligheder
- [ ] Standard admin-adgangskode skiftet
- [ ] SSL-certifikat installeret og HTTPS aktivt
- [ ] Ollama kørende med `qwen3:14b`
- [ ] CORS i `main.py` begrænset til `https://stemmer.norddjurs.dk`
- [ ] `UPLOAD_DIR` peger på korrekt sti med skriverettigheder
- [ ] NIS2-dokumentation godkendt af Mikael
- [ ] DPO har fastsat opbevaringsperiode (indsæt dato i `PRIVACY_POLICY_TEXT`)
- [ ] Test af borgerflow fra end til end
- [ ] Test af admin-login og dashboard

---

## 10. Kontakt

- **Nicklas** — projektleder/udvikler
- **Mikael** — IT-sikkerhed, NIS2, server
- **DPO:** dbr@norddjurs.dk, tlf. 89 59 15 23
