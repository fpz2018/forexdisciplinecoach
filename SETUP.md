# Forex Discipline Coach - Setup Guide

## 1. Supabase Project aanmaken

1. Ga naar [supabase.com](https://supabase.com) en maak een nieuw project
2. Noteer je **Project URL** en **Anon Key** (Settings → API)
3. Ga naar de **SQL Editor** en voer de migration uit:
   - Kopieer de inhoud van `supabase/migrations/001_initial_schema.sql`
   - Plak en run in de SQL Editor

## 2. Lokale Development

```bash
# Kopieer env template
cp .env.local.example .env.local

# Vul je eigen waarden in:
# NEXT_PUBLIC_SUPABASE_URL=https://jouw-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-anon-key

# Start development server
npm run dev
```

Open http://localhost:3000

## 3. Netlify Deployment

### Via Netlify UI:
1. Push code naar GitHub/GitLab
2. Import project in Netlify
3. **Build settings** worden automatisch gelezen uit `netlify.toml`
4. Voeg **Environment variables** toe in Netlify:
   - `NEXT_PUBLIC_SUPABASE_URL` = jouw Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = jouw Supabase anon key

### Via Netlify CLI:
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set NEXT_PUBLIC_SUPABASE_URL https://jouw-project.supabase.co
netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY jouw-anon-key
netlify deploy --prod
```

## 4. Supabase Auth instellingen

In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `https://jouw-netlify-app.netlify.app`
- **Redirect URLs**: `https://jouw-netlify-app.netlify.app/auth/callback`

## 5. Eerste gebruik

1. Registreer een account
2. Ga naar **Instellingen** en stel in:
   - Account balance
   - Risk % per trade
   - Trading windows (standaard: 07:00-09:00 en 14:00-16:00)
3. Open het **Dashboard** met je TradingView chart
4. Klik **Nieuwe Trade** om te beginnen met disciplined traden

## Database Structuur

- `profiles` - Gebruikersinstellingen
- `trading_windows` - Tijdvensters voor trading
- `trades` - Alle trades met checklist data
- `daily_stats` - Dagelijkse statistieken (auto-updated via trigger)

## Tech Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Hosting**: Netlify
- **Charts**: TradingView Widget + Recharts
