# 🎓 Proggaa Telegram Bot

A completely standalone Telegram bot for **Proggaa** (LMS/e-learning platform), built independently of the Proggaa website. It talks to Proggaa only through a clean adapter layer of service interfaces, so it can be pointed at mock data today and the real Proggaa API later — with zero changes to bot code.

> This repo does **not** contain, depend on, or modify any Proggaa website code. Everything here is self-contained.

---

## Status: All 15 phases implemented

| Phase | What | Status |
|---|---|---|
| 1 | Project foundation | ✅ |
| 2 | Bot init + `/start` + `/help` | ✅ |
| 3 | Service/adapter architecture | ✅ |
| 4 | Account linking | ✅ |
| 5 | Student dashboard | ✅ |
| 6 | Courses + Exams + Results | ✅ |
| 7 | Notification system | ✅ |
| 8 | Teacher functionality (courses, exams, live monitor, grading, analytics, announcements) | ✅ |
| 9 | Admin functionality (users, courses, exams, stats, alerts) | ✅ |
| 10 | Payment interface | ✅ |
| 11 | Support system | ✅ |
| 12 | AI mock architecture | ✅ |
| 13 | Question Bank integration interfaces | ✅ |
| 14 | Security hardening | ✅ core pieces in place — see below for what a production rollout adds on top |
| 15 | Full test suite + docs | ✅ unit + integration + true e2e coverage — see below for what's still untested |

---

## Quick start

```bash
npm install
cp .env.example .env
# edit .env and set BOT_TOKEN (get one from @BotFather on Telegram)
npm run dev
```

Then in production:

```bash
npm run build
npm start
```

### Try it out

1. Send `/start` to your bot.
2. Since no account is linked yet, tap **🔗 Connect Proggaa** (or send `/link`).
3. In development mode only, send `/devtoken` — this mints one mock one-time token per demo role (STUDENT/TEACHER/ADMIN), simulating what the real Proggaa website will do under *Settings → Telegram*.
4. Copy one of the tokens and send it to the bot as a plain message.
5. You're now linked as that role. Send `/start` again to see the personalized welcome, or `/dashboard` for the full role-specific dashboard.
6. As the **student** account: try `/courses`, `/exams`, `/results`, `/achievements`, `/notifications`, `/settings`.
7. As the **teacher** account: try `/teacher` and its buttons (Courses, Exams, 🔴 Live Exams, 📝 Grading).
8. As the **admin** account: try `/admin`, `/payments` (approve/reject requires a confirm tap), `/stats`.
9. Try `/ai` (teacher/admin) — walk through the generate → preview → save-to-Question-Bank flow.
10. Try `/support` — pick a category, send a message, get a ticket confirmation.
11. `/unlink` to disconnect (with a confirm step), then repeat with a different role's token to see the difference.

---

## Environment variables

See `.env.example` for the full list. The important ones:

| Variable | Purpose |
|---|---|
| `BOT_TOKEN` | Telegram bot token from @BotFather. Required. |
| `PROGGAA_WEB_URL` | Base URL used by `DeepLinkService` to build every link back to the website. |
| `PROGGAA_API_URL`, `PROGGAA_API_KEY` | Reserved for the future real API client. Unused today. |
| `DATABASE_URL` | Reserved for Prisma-backed persistence. Unused today (everything is in-memory). |
| `PROGGAA_*_PROVIDER` | One per service (`mock` or `api`). Every one currently must be `mock` — see "Going live" below. |

---

## Architecture

```
Telegram
   │
   ▼
Telegram Bot (Telegraf)          src/bot/**
   │  commands, callbacks, keyboards, middleware
   ▼
Proggaa Integration Adapter      src/services/proggaa/interfaces.ts
   │  ProggaaUserService, ProggaaCourseService, ProggaaExamService,
   │  ProggaaResultService, ProggaaPaymentService,
   │  ProggaaNotificationService, ProggaaAIService, ProggaaAdminService,
   │  QuestionBankService, SupportService, TelegramLinkService
   ▼
Provider implementation          src/services/proggaa/mock/*  (today)
                                  src/services/proggaa/api/*   (future)
   ▼
Future Proggaa API
```

### The adapter pattern

Every piece of "Proggaa data" the bot needs is defined as a TypeScript interface in `src/services/proggaa/interfaces.ts` — never as ad-hoc fetch calls scattered through command handlers. Each interface currently has exactly one implementation, a `Mock*Service` in `src/services/proggaa/mock/`, backed by a small in-memory dataset (`mockData.ts`).

`src/services/container.ts` is the single place that decides, per service, which implementation to hand to the bot — based on the `PROGGAA_*_PROVIDER` env var. Bot code (`src/bot/**`) only ever imports the *interface* types, never a `Mock*` class directly, so it has no idea whether it's talking to mock data or a real API.

### How the real Proggaa API replaces the mock later

For any service, e.g. exams:

1. Create `src/services/proggaa/api/ApiProggaaExamService.ts` implementing `ProggaaExamService`, calling the real Proggaa API (using `PROGGAA_API_URL` / `PROGGAA_API_KEY`).
2. In `src/services/container.ts`, add an `"api"` branch that returns `new ApiProggaaExamService(...)`.
3. Set `PROGGAA_EXAM_PROVIDER=api` in `.env`.

No command, keyboard, or middleware file changes. This same recipe applies to every one of the 8+ services independently — you can migrate them one at a time.

### Account linking

`TelegramLinkService` is the abstraction for turning a Telegram numeric user id into an authenticated Proggaa account + role. The bot **never** asks for a Proggaa password. The intended real flow:

1. User goes to the Proggaa website → Settings → Telegram → "Generate code".
2. Website creates a short-lived, single-use token server-side.
3. User sends that token to the bot.
4. The real `ApiTelegramLinkService` verifies the token against the Proggaa backend and returns the linked account + role.

`MockTelegramLinkService` (`src/services/linking/mock/`) implements the exact same lifecycle in memory so the whole flow — token issuance, expiration (10 min TTL), single-use consumption, invalid-token handling, already-linked protection, and account-mismatch protection — is fully testable today. `MockTelegramLinkService.devIssueToken(...)` stands in for "the website generates a token," exposed via the dev-only `/devtoken` command.

### Dashboards, courses, exams, results, achievements (Phases 5–6)

`/dashboard` routes to a role-specific screen (`sendStudentDashboard` / `sendTeacherDashboard` / `sendAdminDashboard` in `bot/commands/dashboard.ts`, `teacher.ts`, `admin.ts`) by reading `ctx.auth.role` — never anything the user can spoof. `/courses`, `/exams`, `/results`, and `/achievements` each fetch through their respective interface (`ProggaaCourseService`, `ProggaaExamService`, `ProggaaResultService`, `ProggaaAchievementService`) and render cards via shared formatters (`bot/messages/formatters.ts`) with deep-link buttons built exclusively through `DeepLinkService` (`bot/keyboards/cards.ts`) — never a hand-built URL.

### Notifications (Phase 7)

`services/notifications/notificationBuilders.ts` has one pure builder function per event type from the spec (exam scheduled, 1-day/1-hour/10-min reminders, started, ending soon, submitted, results published, manual grading completed, cancelled, rescheduled, retake available, plus the teacher-alert and payment events). They just construct a `NotificationEvent` — nothing sends until something calls `ProggaaNotificationService.dispatch(event)`. That keeps them trivially testable and reusable from a future cron job or webhook handler. `/notifications` shows recent history via `getRecentNotifications`; `/settings` lets the user toggle each of the 8 categories through `NotificationPreferenceService`, persisted per user.

### Teacher & Admin (Phases 8–9)

`/teacher` shows course/exam/live-exam/grading counts and its buttons drive into `ProggaaExamService.getLiveExamsForTeacher` (live monitoring cards, link-out only — no exam engine in Telegram) and `ProggaaResultService.getPendingManualGradingCount` (grading queue cards). **Analytics** pulls aggregate figures (avg. course progress, avg. exam score, completion rate) via `ProggaaCourseService.getTeacherAnalytics`. **Announcements** is a full confirm-gated flow: pick a course → write the message → preview → explicit confirm before `AnnouncementService.sendAnnouncement` is called — sending an announcement is called out as a sensitive action in the spec's security section, so it gets the same two-step treatment as payment approval.

`/admin` aggregates `ProggaaAdminService.getStatistics()` plus pending payment count; `/stats` renders the same statistics standalone. **Alerts** surfaces real derived signals — pending-payment counts and suspicious live-exam activity (severity-ranked) — via `ProggaaAdminService.getAlerts()`, always ending with an "operational" baseline entry. Admin actions (disqualify, stats access, alerts) are all gated by `requireRole(ctx, ["ADMIN"])`.

### Payments (Phase 10)

`/payments` lists pending payments as cards with **Approve**/**Reject** buttons. Tapping either **never mutates anything directly** — it shows an explicit confirm/cancel step (`payment:approve:ask:<id>` → `payment:approve:confirm:<id>`), and only the confirm handler calls `ProggaaPaymentService.approvePayment`/`rejectPayment`. Every approve/reject is written to the audit log. Payment ids are validated against a strict pattern before being used, and a payment that's vanished or already been processed surfaces a clean error instead of a crash.

### Support (Phase 11)

`/support` shows the six categories from the spec as buttons; picking one starts a short wizard that captures the next free-text message and calls `SupportService.createTicket`. Ticket storage is mocked (`MockSupportService`) but sits behind the same interface a real Proggaa helpdesk integration would implement.

### AI mock architecture + Question Bank (Phases 12–13)

`/ai` (teacher/admin only) walks through **pick a mode → provide topic/text/file-ref → difficulty or question type → count → generate → preview → Regenerate or Save**. Generation goes through `ProggaaAIService` (`MockProggaaAIService` today — no real model calls), and "Save to Question Bank" writes each previewed question via `QuestionBankService.createQuestion`, wiring Phase 12's output straight into Phase 13's interface. Nothing is saved until the user explicitly approves the preview.

### Identity & security model

- **`ctx.auth` is the only source of identity**, resolved fresh on every update by `src/bot/middleware/auth.ts`. It looks up the Telegram id via `TelegramLinkService`, then re-fetches the current role via `ProggaaUserService` on every request — a role change on the website takes effect immediately, no caching.
- Telegram `username` / `first_name` are **never** treated as identity or role.
- `requireLinked()` / `requireRole()` guards (`src/bot/middleware/guards.ts`) gate every sensitive command and callback — including every teacher/admin action and every payment mutation — not just the top-level `/command`.
- Sensitive actions (payment approve/reject, unlink, saving AI-generated questions) require an explicit confirm step or an equivalent one-way gate rather than acting on the first tap.
- Callback data is validated before use: every entity id (payment ids, etc.) is checked against a strict pattern via `src/utils/validation.ts` (`isValidEntityId`), and every `bot.action()` regex only matches the exact shape it expects — no callback payload is trusted blindly. Free text is also length-bounded (`validateBoundedText` / `TEXT_LIMITS`) before being used for a support ticket or an AI generation prompt, so a single oversized paste can't be used to abuse memory or a future real AI provider's context window.
- Multi-step flows (`/support`, `/ai`) run through a single **wizard** abstraction (`bot/handlers/wizard.ts`) with a 10-minute TTL — a stale wizard is automatically cleared and the user is told their session expired rather than the bot getting stuck waiting for input that will never come the way it expects.
- All free text funnels through one **text router** (`bot/handlers/textRouter.ts`) that decides, from session state, which flow "owns" the next message — avoiding the ordering bugs that come from multiple independent `bot.on("text", ...)` handlers.
- Rate limiting: a simple sliding-window limiter per Telegram id (`src/bot/middleware/rateLimit.ts`).
- Structured logging with automatic redaction of tokens/secrets (`src/utils/logger.ts`), plus a dedicated `logger.audit(...)` channel for sensitive actions (linking attempts, payment approvals/rejections, disqualifications, AI-generated content saved to the Question Bank).
- Global error handling (`src/bot/middleware/errorHandler.ts`) turns any `ProggaaServiceError` (or unexpected error) into a friendly Telegram message instead of a stack trace.

---

## Project structure

```
src/
  bot/
    bot.ts                  Telegraf instance + middleware/command wiring
    commands/                One file per feature area: start, help, link, unlink, devtoken,
                              menu, dashboard, courses, exams, results, achievements,
                              notifications, settings, teacher, admin, stats, payments,
                              support, ai
    keyboards/               Reusable inline keyboards (mainMenu.ts, cards.ts)
    messages/                Centralized copy (copy.ts) + card formatters (formatters.ts)
    middleware/              session, auth, rateLimit, guards, errorHandler, requestLogger
    handlers/                textRouter (free-text dispatch), wizard (multi-step flow helpers)
  services/
    proggaa/
      interfaces.ts          All Proggaa*Service contracts
      errors.ts               Shared error hierarchy
      mock/                   In-memory implementations + shared mock dataset
    linking/mock/             MockTelegramLinkService
    deep-links/DeepLinkService.ts
    notifications/            Reusable notification event builders
    support/MockSupportService.ts
    announcements/MockAnnouncementService.ts
    container.ts              Wires interfaces -> mock (or future api) implementations
  types/                      Domain types (decoupled from Telegram) + session/context types
  config/env.ts                Zod-validated environment config
  utils/logger.ts              Structured logger with secret redaction
  utils/validation.ts           Shared entity-id and bounded-text validators
  index.ts                     Entry point
tests/                         Vitest unit tests
```

---

## What works right now

- `/start` — branded welcome screen; different content/buttons depending on link status.
- `/help` — command reference.
- `/link` — starts the linking flow (via command or the "Connect Proggaa" button), then accepts a one-time token as the next text message.
- `/unlink` — disconnect with an explicit confirm step.
- `/devtoken` — **development only**, mints mock tokens for each demo role.
- `/dashboard` — role-routed dashboard (student progress/XP/streak, teacher course/exam/grading counts, admin platform overview).
- `/courses`, `/exams`, `/results`, `/achievements` — card-based lists with deep-link buttons back to the (future) website.
- `/notifications`, `/settings` — notification history and per-category preference toggles.
- `/teacher` — dashboard plus Courses / Exams / 🔴 Live Exams / 📝 Grading / 📊 Analytics / 📢 Announcements (full confirm-gated send flow).
- `/admin` — dashboard plus Payments / Users / Courses / Exams / Statistics / 🚨 Alerts (real derived signals, not a placeholder).
- `/stats` — platform statistics.
- `/payments` — pending payment cards with a mandatory confirm step before approve/reject.
- `/support` — category picker → free-text ticket creation.
- `/ai` — full generate → preview → regenerate/save-to-Question-Bank wizard (teacher/admin only), backed entirely by mock data.
- Every main-menu inline button routes to a real, working screen.
- Structured JSON logging to stdout, with audit entries for linking, payment decisions, and AI content saved to the Question Bank.
- Environment validation on startup — the bot refuses to start with a clear error if `BOT_TOKEN` (or another required var) is missing/invalid.

## Tests

```bash
npm test
```

Current coverage: `MockTelegramLinkService` (token issuance, expiry, replay protection, already-linked, account-mismatch), `DeepLinkService` URL building, `requireLinked`/`requireRole` guards, wizard expiry, notification event builders, card formatters (progress bar, stats), shared input-validation helpers (entity id patterns, bounded text), and the mock services (users, payments, notification preferences, AI generation, question bank, achievements, admin).

`tests/integration-commands.test.ts` drives the real exported command functions (`sendDashboard`, `sendCourses`, etc.) against the actual mock `ServiceContainer` through a lightweight fake context (`tests/helpers/fakeContext.ts`).

`tests/e2e-bot.test.ts` goes one step further still: it builds the **real bot** via `createBot()` — the actual middleware chain (session, auth resolution, rate limiting, error handling) and every real command/action handler — and dispatches hand-built Telegram `Update` objects through `bot.handleUpdate(...)`, exactly like a real webhook delivery. Only the network layer (`bot.telegram.sendMessage` / `editMessageText` / `answerCbQuery`) is stubbed, so these tests catch wiring bugs (middleware order, action-pattern collisions, missing guards) that function-level tests can't. It covers: the unlinked `/start` screen, proof that a suspicious Telegram `username` is never trusted, a full `/link` → token → `/start` round trip, an invalid-token rejection, `/admin` authorization for unlinked/STUDENT/ADMIN callers, and the two-tap payment-approval confirmation flow.

> **Note:** `src/config/env.ts` requires `BOT_TOKEN` and calls `process.exit(1)` if it's missing outside of tests — several modules (`DeepLinkService`, `services/container.ts`) import it at module load time. `tests/setup.ts` (wired via `vitest.config.ts`'s `setupFiles`) sets a dummy `BOT_TOKEN`/`NODE_ENV=test` before any test file's imports run, so `npm test` works without a real `.env`. `env.ts` itself also throws instead of exiting when `NODE_ENV=test`, as a second line of defense.
>
> **Also note:** I built and hand-reviewed this project without network access, so `npm install`/`tsc`/`vitest` have not actually been run against it. `tests/e2e-bot.test.ts` in particular makes a few assumptions about telegraf's internals (that `ctx.reply` delegates to `bot.telegram.sendMessage`, etc.) based on telegraf's documented/well-known architecture, but please run `npm test` to confirm before relying on it.

## Remaining work

- Phase 14 (further hardening): the pieces described above are in place; a production rollout would add persistent rate-limit/session storage (Redis), stricter callback-query origin checks, and structured audit log shipping.
- Phase 15 (testing/docs): unit tests, function-level integration tests, and true `bot.handleUpdate()` end-to-end tests are all in place now (see `tests/e2e-bot.test.ts`). Remaining: broaden e2e coverage to the AI/support/announcement wizards, and add sequence diagrams for the linking and AI flows to the docs.
- Real `Api*Service` implementations and Prisma-backed persistence are future work once the real Proggaa API exists — the interfaces and mock flows are ready to receive them (see "Going live" above).
- `/ai`'s "Generate From PDF" step now accepts a real Telegram file upload (captured via `bot.on("document", ...)` in `ai.ts`) — it just doesn't extract/parse PDF content yet, since that depends on a real AI backend that doesn't exist to plug into.
