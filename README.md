# Proggaa Telegram bot

The Telegram companion of the **Proggaa** learning platform. It is another way into Proggaa, not a separate product:
everything it shows is read from the Proggaa website, and it keeps no copy of Proggaa's data.
Design and security notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What you can do from Telegram

Most of Proggaa works inside the chat. Everything is read from, and done through, the website's own code, so the rules
(prices, coupons, access, coins) are exactly the website's.

| Area | What it does |
|---|---|
| **Account** | `/link` with a one-time code from the website, `/unlink`. |
| **Study** | `/missions`: open a Mission, then an Operation, then a Patrol (with ✓, 🔒 and live markers). Read a Patrol's description and resources, add a personal note, jump to the previous or next Patrol. |
| **Join and buy** | `/browse` and `/search`: find Missions, join free ones in one tap, or buy a paid one: optional coupon, see the amount, number and reference, then send your Transaction ID in the chat. `/payments` shows your payments. |
| **Rewards** | `/dashboard` (level, XP, Proggy Coins, streak), `/wallet`, `/store` (spend Proggy Coins, with confirmation), `/leaderboard`, `/medals` (with verification links), `/achievements`, `/progress`, `/studyplan`. |
| **Schedule** | `/live` (live and upcoming classes), `/calendar`, `/exams` and `/results` (your Encounters and scores). |
| **Updates** | `/notifications`, `/announcements`, `/settings` (choose which Proggaa notifications are sent to Telegram), and Proggaa's own notifications arrive in the chat by themselves. |
| **Mentors** | `/teacher`: your Missions, Encounters, live monitoring, grading counts, analytics; and **Announce to a Mission**, **Grant access**, **Issue a Medal** (preview, then confirm). |
| **Admins** | `/admin`, `/payments` (verify or reject with a reason), `/stats`, Group Assistant tools. |

### What stays on the website, on purpose
- **Watching the video.** Patrol videos play in Proggaa's protected player, which also measures how much you really watched
  (that is what completes a Patrol and earns XP). Every Patrol has a "Watch on Proggaa" button; the bot never shows a video link.
- **Taking an Encounter (exam).** Exams use fullscreen and tab-switch monitoring and time limits that a chat cannot enforce.
  The bot lists them, reminds you and shows results; the button opens the exam.
- **Uploading files, editing profile details, the Mission builder, payment devices.**

All times are Bangladesh time.

## Run it locally

You need a Proggaa website to talk to (a local one is fine) and a bot token from [@BotFather](https://t.me/BotFather).

```bash
cp .env.example .env     # set BOT_TOKEN, PROGGAA_WEB_URL, PROGGAA_API_KEY
npm install
npm run dev              # polling mode
```

`PROGGAA_API_KEY` must equal the website's `PROGGAA_API_KEY`. To link: sign in on Proggaa, open
`/settings/telegram`, press **Generate code**, then send `/link` and the code to the bot.

```bash
npm test          # 125 tests, no network
npm run typecheck
npm run build     # compiles to dist/
```

## Configuration

See `.env.example` (every variable is documented there). The ones that matter:

| Variable | |
|---|---|
| `BOT_TOKEN` | from BotFather |
| `PROGGAA_WEB_URL` | the website's public address (links) |
| `PROGGAA_API_URL` | optional, defaults to `PROGGAA_WEB_URL` |
| `PROGGAA_API_KEY` | shared secret, same as on the website |
| `BOT_MODE` | `polling` locally, `webhook` on a web host |
| `WEBHOOK_SECRET_PATH` | webhook mode: random, 16+ characters |
| `PERSISTENCE_DIR` | optional folder (a Render Disk) so mutes and the notification position survive restarts |

## Deploy on Render

Web Service, build `npm install && npm run build`, start `npm start`, and set `BOT_MODE=webhook`,
`WEBHOOK_SECRET_PATH`, `BOT_TOKEN`, `PROGGAA_WEB_URL`, `PROGGAA_API_KEY`, `NODE_ENV=production`. Render supplies `PORT` and
`RENDER_EXTERNAL_URL`. Do **not** set a per-service provider: there is no demo mode.

A free instance sleeps after 15 minutes without traffic; point an uptime pinger at `/healthz`, or use a paid instance.
Nothing is lost while it sleeps: the relay reads what it missed when it wakes (add a Disk and `PERSISTENCE_DIR` to make that exact).

## Website side

The bot needs these routes on the Proggaa website (all under `/api/bot/*` and `/api/telegram/link`, authenticated with the
API key): see the table in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#4-integration-model).

## Layout

```
src/
  bot/         commands, keyboards, messages (brand, copy, formatters), middleware (auth, scope, rate limit, session)
  services/    proggaa/ (interfaces + api/ client and mappers), notifications/ (relay, mutes), deep-links/, groups/
  utils/       time (Bangladesh time), validation, logger, file store, keep-alive
  config/      env
tests/         unit and bot-flow tests; fakes/ are in-memory stand-ins for Proggaa
```
