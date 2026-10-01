# Architecture

The bot is a **companion to Proggaa**, not a second product. Proggaa (the website) owns every piece of
business data; the bot is a thin Telegram client of it.

```
 Telegram  ←→  Proggaa bot  ──HTTPS + X-Api-Key──▶  Proggaa website (/api/bot/*, /api/telegram/link)
 (heroes,        │                                     │
  mentors,       ├─ bot-owned only:                    └─▶ Proggaa database (single source of truth)
  admins)        │    · notification mutes
                 │    · notification relay position
                 │    · group assistant settings
                 └─ in memory: sessions, rate limits
```

## 1. Proggaa architecture (what the bot has to fit)

- Next.js 14 App Router, TypeScript, Prisma 5, PostgreSQL. Plain LMS nouns in code and database; the product says
  **Mission** (Course), **Operation** (Module), **Patrol** (Lesson), **Encounter** (Exam), **Challenge** (Assignment),
  **Medal** (Certificate), **Hero** (Student), **Mentor** (Teacher), **Proggy Coins**, **XP**.
- Auth is Proggaa's own: phone + OTP + password, database sessions. Roles `STUDENT`, `TEACHER`, `ADMIN`, `SUPER_ADMIN`.
- Every mutation is a Server Action behind `requireActiveUser` / `requireMentorUser` / `requireAdminUser`.
- Money is integer poisha, shown as ৳. Every time shown to a person is Bangladesh time (UTC+6, no daylight saving).
- Gamification: `HeroStats` (XP, level, streak, coin balance), a level curve in `lib/gamification/xp-curve.ts`,
  achievements, a coin ledger and the Proggy Store.
- Live classes are Patrols with a schedule; exams (Encounters) have live monitoring windows and integrity events.
- Payments: a hero submits a bKash transaction id, an admin verifies it (or an Android device matches the SMS).
- Notifications: a `Notification` row is created by Proggaa for every event a hero should hear about.
- Integration surface for this bot already existed: `/api/bot/*` routes, `/api/telegram/link*`, the `TelegramLink` and
  `TelegramLinkToken` tables, and `requireBotApiKey` / `requireLinkedUser` in `lib/auth/bot-auth.ts`.

## 2. The old bot (what was found)

- Telegraf 4, one in-memory `Mock*Service` per interface, with a small `Api*` layer bolted on later.
- About 7,400 lines, of which a large share served features that have **no counterpart in Proggaa**: an AI tutor and
  question generator, a question bank, a support ticket system, announcements sent from Telegram, "system alerts".
  All of it ran on fabricated data.
- Real defects: dates were formatted in the **server's** timezone (UTC on Render), deep links pointed at pages that do
  not exist (`/courses/<id>`, `/exams/<id>/grading`, `/admin/payments/<id>`), Markdown in Mission names could break
  messages, session and rate-limit maps grew without bound, group chats were protected by a deny-list that new
  commands would silently bypass, a `/devtoken` command existed, and notifications that Proggaa never sent were
  built inside the bot.

## 3. Preserved / rewritten / removed / added

| | |
|---|---|
| **Preserved** | Telegraf, the link flow idea (website-issued one-time code), role re-check on every update, confirm-before-sensitive-action, the Group Assistant (welcome, FAQ, moderation), the file store for bot-owned settings. |
| **Rewritten** | Service layer (production code has **no demo mode**; fakes live in `tests/fakes`), formatters and copy (Proggaa words and palette), keyboards, deep links (real routes), chat scoping (allow-list), session and rate limiting, every command. |
| **Removed** | AI tutor and question generation, question bank, bot-side support tickets, bot-side announcements, system alerts, `/devtoken`, the mock providers and `PROGGAA_*_PROVIDER` switches, the push receiver, Prisma and `DATABASE_URL` (the bot has no database). |
| **Added** | Level, XP, Proggy Coins and streak everywhere; `/wallet`; `/live`; a notification **relay** that mirrors Proggaa's own notifications; BST time helpers; strict link-code validation; link-attempt limits; webhook secret header; callback-data validation; a startup configuration check. |

## 4. Integration model

The bot only ever talks to Proggaa through the interfaces in `src/services/proggaa/interfaces.ts`. The `Api*` classes
call these website routes with `X-Api-Key`:

| Purpose | Route |
|---|---|
| Link / unlink / who is linked | `/api/telegram/link` (POST, DELETE, GET) |
| Profile, XP, level, coins, streak | `GET /api/bot/users/:id` |
| Missions, Encounters, results, achievements | `/api/bot/courses`, `/exams`, `/results`, `/achievements` |
| Live classes | `GET /api/bot/live-classes` |
| Notifications list and **feed** | `GET /api/bot/notifications`, `GET /api/bot/notifications/feed` |
| Payments (own, pending queue, approve, reject) | `/api/bot/payments*` |
| Mentor | `/api/bot/teacher/courses`, `/exams`, `/exams/live`, `/exams/:id/grading-count`, `/courses/:id/analytics` |
| Admin | `/api/bot/admin/statistics`, `/api/bot/admin/users` |

Rules: no business rule is re-implemented in the bot (level curve, grading letters aside, see below, payment
verification, enrolment all stay in Proggaa); a missing capability is added to `/api/bot/*` rather than faked.

Two small things are still computed in the bot because Proggaa does not store them: the Encounter status label (derived
from Proggaa's own window fields in `mappers.ts`) and a letter grade from the percentage.

## 5. Data ownership

Cached: **nothing** from Proggaa. The only bot-owned data:

| Data | Where | If lost |
|---|---|---|
| Which notification categories a hero muted | JSON in `PERSISTENCE_DIR` (else memory) | everything is switched back on |
| The relay's position in the feed + recent delivered ids | same | the last `RELAY_LOOKBACK_MINUTES` are re-read, delivered ids are not repeated if the file survives |
| Group assistant settings | memory (+ env `PROGGAA_GROUP_IDS`) | defaults |
| Sessions, rate-limit counters | memory, evicted when idle | people simply start the step again |

## 6. Account linking

```
Hero signed in on Proggaa → Settings → Telegram → "Generate code"      (10 minute, single-use, only a hash stored)
Hero sends the code to the bot (private chat only)
Bot shape-checks it (XXXX-XXXX-XXXX), rate-limits attempts, POSTs {token, telegramId} to Proggaa
Proggaa redeems it atomically and creates TelegramLink(userId, telegramId)
```

One Telegram account ↔ one Proggaa account (unique constraints on both sides). `/unlink` asks for confirmation. The
bot never sees a password, OTP secret or session. The role is read from Proggaa on **every** update, so a demotion
applies immediately.

## 7. Security model

- Identity is the numeric Telegram id resolved through the website's link. Usernames, display names, callback data and
  deep-link parameters are never identity or authorization.
- Authorization is server-side: every handler calls `requireLinked` / `requireRole`, and Proggaa re-checks
  (`requireLinkedUser`, admin and mentor ownership) on each call. The bot passes the linked user's id, never an id taken
  from a message.
- Telegram → bot: webhook path is a secret and Telegram's `X-Telegram-Bot-Api-Secret-Token` header (derived from the bot
  token and path) is verified. Bot → Proggaa: shared `PROGGAA_API_KEY`, compared in constant time by Proggaa, never logged.
- Personal commands and buttons are refused outside private chats (allow-list), so data and link codes never reach a group.
- Callback ids are matched with strict patterns; group ids from buttons must be on the configured list; sensitive actions
  (approve or reject a payment, group announcement, unlink) always need a second, confirming tap.
- Rate limits: 15 updates / 10 s per person, 6 link-code attempts / 10 min per person (Proggaa limits them as well).
- Output is escaped (Markdown for names, HTML for relayed notifications); links must be plain paths on the Proggaa site.
- Startup refuses to run without a real API key, or with a `localhost` address in production. The logger redacts
  secret-looking fields.
- Replay: link codes are single use; relayed notifications are de-duplicated by id.

## 8. Time

`src/utils/time.ts` is the only place a date becomes text. It uses `Asia/Dhaka` explicitly, so the result is the same on a
UTC server. Tested under four process timezones (`TZ=UTC`, `America/New_York`, `Asia/Dhaka`, `Pacific/Kiritimati`).

## 9. Notification model

Proggaa already writes a `Notification` for exam reminders, grades, live-class reminders, announcements, enrolments,
payments, achievements and streak risks. Instead of asking Proggaa to call the bot from many places, the bot **pulls**:

```
every RELAY_INTERVAL_SECONDS:  GET /api/bot/notifications/feed?after=<cursor>   (oldest first, linked heroes only)
for each item: skip if the hero muted its category → send (HTML) with an "Open on Proggaa" button → advance the cursor
```

A bot that was asleep or offline catches up from its saved position. Blocked bots (403) are skipped, flood limits (429)
pause the run, other failures are retried a few times. The relay only needs the website to be reachable; the website needs
no knowledge of the bot.

## 10. Admin model

Admins can see statistics, the payment queue and approve or reject (reject asks for a reason the hero sees), and manage
the Group Assistant. Anything deeper (disqualifying a student, editing users) stays on the website on purpose.

## 11. Testing

`npm test` (92 tests): unit tests for mappers, validation, time, deep links, formatters, rate limiting; the real
`createBot()` pipeline driven with hand-built Telegram updates for linking, role authorization, group refusal, payment
confirmation, tampered callbacks, flood control and failure messages; the relay with a fake feed and sender. Network is
never touched. Not covered automatically: a real Telegram chat, and the website's database (those are checked by
running the bot against a local Proggaa).

## 12. Deployment

Any host that can run Node 18.17+ and receive HTTPS. Render web service: build `npm install && npm run build`, start
`npm start`, `BOT_MODE=webhook`. A free instance sleeps after 15 minutes idle; the relay catches up when it wakes, and
`KEEP_ALIVE` or an uptime pinger on `/healthz` reduces the sleeping. See the README for the variables.
