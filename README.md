# Letterhead Studio

### 🔗 Live: **https://fezmustafah.github.io/**

AI-powered document studio. Upload your company letterhead, describe what you
need in plain words (or by voice), and the tool writes a print-ready PDF —
quotation, invoice, salary certificate, letter — on top of your letterhead.

Live:
- **Main site:** https://fezmustafah.github.io/
- **Studio (app):** https://fezmustafah.github.io/app/

## Structure (monorepo)

```
/app    — the editor SaaS (React + Vite + Tailwind, jsPDF, Supabase, Gemini)
/site   — the marketing landing page (React + Vite + Tailwind + GSAP + react-router)
```

Both deploy independently as static Vite builds.

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18, Vite, Tailwind |
| PDF | jsPDF + jspdf-autotable |
| Local store | idb-keyval (IndexedDB) |
| Auth + cloud | Supabase (email + Google OAuth) |
| AI | Google Gemini via a Supabase Edge Function |
| Voice | Web Speech API |
| Hosting | GitHub Pages (user site at root + `/app/`) |

## Develop

```bash
cd app
npm install
# create .env with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev   # → http://localhost:5173

cd ../site
npm install
npm run dev   # → http://localhost:5180
```

## Deploy

Each subdir is a standalone Vite project. `npm run build` produces `dist/` —
deploy that folder to Netlify (already wired) or any static host.

## Free tier

New accounts start with **5 free AI documents**. After that, manual editing
stays unlimited. Quota is enforced server-side via the `consume_ai_credit()`
Postgres RPC in `/app/supabase/quota.sql`.

## Security note

Real bank/TRN data has been removed from source. The current `brandKits.js`
ships neutral starter presets only.
