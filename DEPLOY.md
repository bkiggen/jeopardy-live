# Deployment

Frontend on **Vercel**, backend on **Fly.io**, Postgres on **Neon** (free 3GB tier).

You'll need accounts on all three. Roughly 30 minutes start to finish.

---

## 0. Prereqs (one-time)

```bash
# Fly CLI
brew install flyctl
fly auth login

# Vercel CLI (optional — you can also do everything in the dashboard)
npm i -g vercel
vercel login
```

Have your secrets ready:
- `APP_PASSCODE` — the host passcode you use locally (e.g. `olio`)
- `ANTHROPIC_API_KEY` — from console.anthropic.com (used live for clue judging)

> **ElevenLabs is local-only now.** The runtime plays pre-generated MP3s
> committed under `frontend/public/audio/`, so you don't need ElevenLabs
> credentials in production. To regenerate the clips locally with a
> different voice, set `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` in
> `backend/.env` and run `npm run generate-audio` from the backend dir,
> then commit the resulting mp3 files.

---

## 1. Provision Postgres (Neon)

1. Sign up at https://neon.tech
2. Create a project — name it `standup-jeopardy`
3. Copy the **Connection String** (looks like `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`)
4. Hold onto it — you'll paste it as a Fly secret in step 3

---

## 2. Create the Fly app

From the `backend/` directory:

```bash
cd backend
fly launch --no-deploy
```

Walk-through:
- Choose an app name (e.g. `standup-jeopardy-bkiggen`). **Update `fly.toml`'s `app =` line** to match.
- Pick a region close to you (default `ord` is Chicago).
- Decline the Postgres + Redis prompts (we're using Neon).
- Decline the deploy prompt — we want to set secrets first.

This generates `fly.toml` (already committed), reads the `Dockerfile`, and creates the app.

---

## 3. Set secrets

```bash
fly secrets set \
  DATABASE_URL='paste-the-neon-connection-string-here' \
  APP_PASSCODE='your-passcode' \
  ANTHROPIC_API_KEY='sk-ant-...' \
  CORS_ORIGIN='https://your-vercel-domain.vercel.app'
```

You don't have your Vercel domain yet — leave `CORS_ORIGIN` off for now and add it after step 6, OR use a wildcard for first deploy:

```bash
fly secrets set CORS_ORIGIN='https://standup-jeopardy.vercel.app,https://standup-jeopardy-*.vercel.app'
```

---

## 4. First deploy

```bash
fly deploy
```

Fly will build the Dockerfile, push the image, and start a machine. The `release_command` in `fly.toml` runs `prisma migrate deploy` automatically before the new version takes traffic, so the schema is in place on first boot.

When it's done:
```bash
fly status
fly open /health
```

You should see `{"ok":true}` in the browser.

---

## 5. Import the clue dataset

The 216k Kaggle clues aren't in the image's database — we need to load them once:

```bash
# Bundled JSON is already inside the container at src/data/200k_questions.json.
# Use the :prod variant — the dev one (`npm run import-clues`) tries to load
# the .ts source via tsx, but the runtime image only has compiled dist/.
fly ssh console -C "npm run import-clues:prod"
```

This takes ~30 seconds. Verify:

```bash
fly ssh console -C "node -e \"require('./node_modules/@prisma/client').PrismaClient && new (require('./node_modules/@prisma/client').PrismaClient)().clue.count().then(c => console.log('clues:', c))\""
# expect: clues: 216930
```

Also seed the active season:

```bash
fly ssh console -C "npm run seed:prod"
```

---

## 6. Deploy the frontend (Vercel)

From the repo root:

```bash
cd frontend
vercel
```

Walk-through:
- Project name: `standup-jeopardy` (or whatever)
- Link to existing project? `n`
- Detected framework: **Vite** ✓
- Override settings? `n`

Once deployed, get the URL — something like `https://standup-jeopardy-xyz.vercel.app`.

**Set the API URL env var** so the frontend knows where the backend lives:

```bash
vercel env add VITE_API_URL production
# paste: https://your-fly-app.fly.dev
```

Then redeploy so the env var takes effect:

```bash
vercel --prod
```

---

## 7. Patch the CORS allowlist

Now that you have the Vercel URL, lock the backend's CORS to it:

```bash
fly secrets set CORS_ORIGIN='https://standup-jeopardy-xyz.vercel.app'
# Fly auto-restarts on secret change
```

---

## 8. Smoke test

1. Open your Vercel URL
2. Click **Start Game** → enter passcode → should redirect to `/r/CODE?host=1`
3. Copy the invite link, open in incognito → should join as player
4. Click a tile, host should hear ElevenLabs audio, both should see the clue
5. Player buzzes, types, submits → host gets Claude verdict + Approve/Override

If sockets fail (`● error` in header):
- Make sure `CORS_ORIGIN` includes your Vercel domain *exactly* (https, no trailing slash)
- Check `fly logs` for socket errors
- Verify `fly status` shows the machine as running

---

## CI/CD

Vercel automatically redeploys the frontend on every `git push` to `main` once you've connected the GitHub repo (do this from the Vercel dashboard).

For the backend, you can either:
- Run `fly deploy` manually after backend changes
- Set up a GitHub Action that calls `fly deploy` on push to `main`

For a hackathon, manual is fine.

---

## Costs

| Service | Free tier | What you'll use |
|---|---|---|
| Vercel | Unlimited static hosting | Negligible |
| Fly.io | $5/mo trial credit + small free tier | ~$3/mo for `shared-cpu-1x` 512mb |
| Neon | 3GB storage, generous compute | Negligible |
| Anthropic | Pay-as-you-go | ~$0.001 per clue judged with Haiku 4.5 |
| ElevenLabs | One-time generation only | $0 ongoing — clips are committed and served as static files |

Daily standup play (~5 clues × 5 days × 4 weeks = 100 clues/mo) is well under the trial credits. Heavy use, you're looking at $5-10/mo total.

---

## Troubleshooting

**`fly deploy` fails on Prisma migrations** — likely DATABASE_URL is wrong or Neon's connection requires `?sslmode=require` (it does; make sure your URL has it).

**Audio doesn't play on the host's machine** — clips are served from `frontend/public/audio/`. Make sure the mp3 files are committed (run `cd backend && npm run generate-audio` if they're missing). Browser may block audio until first user gesture; clicking a tile counts.

**Sockets connect but immediately disconnect** — almost always CORS. Check `fly logs` for an error mentioning the origin.

**Anthropic 401** — wrong key, or the key has been revoked. Generate a new one and `fly secrets set ANTHROPIC_API_KEY=...`.
