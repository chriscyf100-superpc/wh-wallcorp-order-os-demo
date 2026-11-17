# W&H Wallcorp Order OS Demo

Public, downloadable demo for **W&H Wallcorp Sdn. Bhd.**  
This repository is designed for workshop participants to run and deploy themselves.

## What this demo is

- A fictional Order OS for building materials and mortar additives
- Browser-only demo workflow with seeded sample data
- No backend and no database required
- Data is stored locally in the browser (`localStorage`)

## Prerequisites

- Node.js **20+** (Node 22 LTS recommended)
- npm (bundled with Node.js)

## Run locally

```bash
npm install
npm run dev
```

Open: http://localhost:4317

### Demo login

- Password: `wh demo`

The app pre-fills this in demo mode.

## Optional password override

```bash
cp .env.example .env
```

Then edit:

```env
VITE_MANAGER_PASSWORD=your-demo-password
```

## Build from a clean clone

```bash
npm install
npm run build
```

## Deploy on Vercel

### Option A - Import this repo
1. Open https://vercel.com/new
2. Import this GitHub repo
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

### Option B - Vercel CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts.

## Public safety notes

- No production secrets are included
- `.env*` files are ignored (except `.env.example`)
- Demo records are fictional and safe for workshop use
