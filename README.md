# Diamond Solution

A study/exam-prep platform for students across Africa: structured course content, practice
quizzes, a leaderboard, an affiliate/referral program, and an admin back office.

- **Frontend**: React 19 + Vite + Tailwind, client-side routed with `react-router-dom`.
- **Backend**: A single Express server (`server.ts`) serving both the built frontend and a
  small `/api/*` surface, using the **Firebase Admin SDK** for privileged operations.
- **Data**: Cloud Firestore (Native mode), Firebase Auth, Firebase Storage for media.
- **Project home**: this app was built in Google AI Studio (`firebase-blueprint.json`,
  `firebase-applet-config.json`, `metadata.json` are AI Studio artifacts) and its Firestore
  database runs on an AI-Studio-provisioned "shared quota" Enterprise-edition instance —
  not a standalone Firebase Spark project. Keep that in mind when reasoning about quota; see
  [Operational notes](#operational-notes--lessons-learned) below.

## Getting started

```bash
npm install
cp .env.example .env   # fill in the values below
npm run dev             # runs server.ts with tsx, serves the Vite dev app on :3000
npm run build            # vite build (frontend) + esbuild bundle of server.ts -> dist/server.cjs
npm run start             # node dist/server.cjs (production)
npm run lint                # tsc --noEmit
```

### Environment variables (`.env`)

| Variable | Used for |
|---|---|
| `VITE_PAYSTACK_PUBLIC_KEY` | Client-side Paystack checkout widget |
| `PAYSTACK_SECRET_KEY` | Server-side payout/verification calls to Paystack |
| `ADMIN_SECRET` | Reserved for admin-only server operations |
| `RESEND_API_KEY` | (Legacy/alternate) transactional email |
| `BREVO_API_KEY` / `BREVO_FROM_EMAIL` | OTP and notification emails (Brevo) |
| `GEMINI_API_KEY` | `/api/translate` (Gemini-powered French translation) |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `ADMIN_WHATSAPP_NUMBER` / `WHATSAPP_VERIFY_TOKEN` | WhatsApp Meta API integration |

Firebase client config lives in `firebase-applet-config.json` (checked in — it's a public
client config, not a secret: `apiKey` here only identifies the Firebase project, it does not
grant access on its own). The Firebase **Admin SDK** used by `server.ts` authenticates via
Application Default Credentials (no service-account JSON is checked in); see `getFirestore()`
in `server.ts` for how it resolves the project/database.

## Project structure

```
server.ts                  Express app: static hosting + /api/* routes (Firebase Admin SDK)
firestore.rules             Firestore security rules (see "Security model" below)
firebase-blueprint.json     AI Studio data-model blueprint (entity/schema reference)
firebase-applet-config.json Public Firebase client config
security_spec.md            "Dirty Dozen" adversarial payloads the rules must reject
src/
  pages/                    Route-level screens (Dashboard, StudyPage, AdminDashboard, ...)
  components/                Shared UI (Layout, MediaManager, OnboardingTour, ...)
  context/                    AuthContext (role/admin resolution), LanguageContext
  lib/                        firebase.ts, firebaseUtils.ts, SessionService.ts, biometrics.ts
```

## Data model (Firestore collections)

| Collection | Shape / purpose |
|---|---|
| `users/{uid}` | Profile, `role` (`student`/`moderator`/`admin`), balance, affiliate status, suspension state, session token. See `firebase-blueprint.json` for the full schema. |
| `dailyPractice/{uid}_{yyyy-mm-dd}` | One doc per user per day: `attempted`, `correct`, `studyDuration` (seconds). Written by `StudyPage.tsx` while a user practices; also the source for the leaderboard and the admin "Most Active Scholars" analytics. |
| `login_events/{autoId}` | One small doc per sign-in — `{ uid, timestamp, dateKey, hour }` — written by `SessionService.startSession()`. Powers the admin "visit frequency / peak hours" charts. Read-only to admins, write-only (own doc) to the signed-in user. |
| `payments/{id}` | Course/reactivation payments (Paystack). |
| `withdrawals/{id}` | Affiliate payout requests. |
| `courses/{id}` + `courses/{id}/content/{id}` | Course catalogue and gated question content. |
| `faculties/{id}` | Departments/faculties and their pricing. |
| `notifications/{id}` | Per-user notifications (including affiliate commission alerts). |
| `activityLogs/{id}` | Per-question answer history (own-user "Revision Center" screen). |
| `quotes/{id}` | Motivational quotes shown in the app. |
| `chats/{uid}` (+ `messages` subcollection) | Support chat threads. |
| `admins/{uid}` | Secondary admin marker collection, kept in sync with `users/{uid}.role === 'admin'`. |
| `system_logs/{id}` | Server-side audit trail (OTP dispatch, admin user deletion, etc.). |
| `otp_codes/{id}`, `user_sessions/{uid}` | OTP verification and session/device bookkeeping. |
| `settings/{id}` | Global app settings (public read, admin write). |

## Roles & admin access

Three roles: `student` (default), `moderator`, `admin`. A user is treated as admin if **any**
of the following is true (see `isAdmin()` in `firestore.rules`, `checkIsAdmin()` in `server.ts`,
and the `isAdmin` value from `useAuth()` in `AuthContext.tsx`):

1. Their `users/{uid}.role === 'admin'`.
2. There's a matching doc in `admins/{uid}`.
3. Their email matches the hardcoded super-admin (`peteradekunle923@gmail.com`) — a
   break-glass fallback that works even before any Firestore doc exists.

**To promote/demote a user**: open the admin dashboard → Users tab → change the role
dropdown on their row (requires OTP security clearance). This updates `users/{uid}.role` and
keeps `admins/{uid}` in sync. There is no need to hand-edit Firestore for this any more.

**If you have no admin account yet** (bootstrap case): edit the target user's `users/{uid}`
document directly in the Firebase Console and set `role` to `"admin"` — see
[Firestore Console → users collection]. After that, all further role changes can go through
the admin dashboard.

## Admin dashboard (`/admin`, `src/pages/AdminDashboard.tsx`)

Tabs, each backed by its own component and its own scoped Firestore listeners (only the
active tab's listeners are mounted):

- **Dashboard** — headline stats (revenue, students, pending commissions/withdrawals/support).
- **Users** — search/filter, add a user, suspend/unsuspend, approve affiliate partner status,
  **change role** (student/moderator/admin), **delete user** (removes their Auth account and
  Firestore records — see [API](#backend-api-serverts) below).
- **Affiliates / Withdrawals** — approve commissions, process payouts.
- **Payments** — financial ledger, CSV export.
- **Analytics** — revenue & payout history charts, plus **Engagement Analytics**:
  - *Most Active Scholars*: ranked by questions attempted over a selectable 7/30/90-day
    window, with accuracy and total study time, sourced from `dailyPractice`.
  - *Page Visits Over Time*: daily visit counts from `login_events`.
  - *Peak Visit Hours*: visits bucketed by hour-of-day (each visitor's local time), from
    `login_events`.
  - This section is a **one-time fetch on load + manual "Refresh" button**, not a live
    listener — see the note on read amplification below for why that matters.
- **Departments / Questions / Pictures** — course/faculty/question-bank content management.
- **Notifications / Quotes / Support** — messaging and content tools.
- **System Logs** — audit trail of OTP dispatch, admin deletions, etc.
- **Settings** — global app settings.

## Backend API (`server.ts`)

All routes are mounted on the same Express app that also serves the built frontend.
`verifyFirebaseToken` middleware validates the caller's Firebase ID token; admin-only routes
additionally call `checkIsAdmin(uid)`.

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Liveness check |
| `POST /api/otp/request` | none (rate-limited) | Generates + emails an OTP for a purpose (device verification, reactivation, password change) |
| `POST /api/send-otp` | none | Sends a specific OTP code by email |
| `POST /api/activate-affiliate` | Firebase ID token | Activates affiliate status for self, or (admins) another user |
| `POST /api/payout` | Firebase ID token (rate-limited) | Initiates a Paystack payout for self, or (admins) another user |
| `POST /api/translate` | none | Gemini-powered French translation of quiz content |
| `POST /api/admin/delete-user` | Firebase ID token, **admin only** | Deletes a user's Firebase Auth account + their `users/`/`admins/` Firestore docs. Client SDKs can't delete another user's Auth account — this is why it's a server route. |
| `POST /api/public-profiles` | Firebase ID token (any signed-in user) | Given a batch of user IDs, returns **only** `displayName`/`department`/`role` for each. Used by the leaderboard, dashboard, and admin analytics so the client never needs a broad Firestore read on `users` (which also holds email/balance/bank details) just to show a name. |

## Security model

`firestore.rules` is the source of truth for who can read/write what; `security_spec.md`
documents a "Dirty Dozen" of adversarial payloads the rules are expected to reject (use it as
a manual regression checklist after editing the rules).

Key points:

- **`allow list` must hold for every document a query could return** — Firestore rejects the
  whole query if it can't prove that, it does not silently filter results. A clause that's
  true for *every* well-formed document (e.g. `role in [...]`, since every valid user doc has
  a role) is therefore equivalent to "list the whole collection", even if it reads like a
  filter. Every `allow list` in this file is written to be a genuinely narrow, per-document
  condition — when adding a new one, ask "could this be true for every document?" first.
- `users/{uid}`: `get` requires sign-in (not world-readable); `list` only matches a caller's
  own referrals, referral-code lookups, and biometric-device lookups — never an unfiltered
  scan. Broad cross-user profile reads (leaderboard, analytics) go through
  `/api/public-profiles` instead, which returns only non-sensitive fields via the Admin SDK
  (bypassing rules entirely, by design, since it never returns email/balance/bank details).
- `role`, `balance`, `email`, and `affiliateStatus` on `users/{uid}` can only be changed by an
  admin, never by the document owner (see `allow update` in `firestore.rules`).
- **Deploying rule changes**: editing `firestore.rules` in this repo does **not** update the
  live database by itself. Publish it via the Firebase Console (Firestore → Rules → paste →
  Publish) or `firebase deploy --only firestore:rules` if you have the Firebase CLI configured
  for this project. Code and rules can drift if you forget this step.

## Operational notes / lessons learned

This project has a documented history of a Firestore-quota incident worth knowing about
before touching real-time listeners:

- **Never re-fetch a whole cross-user data set inside an `onSnapshot` callback.** The
  leaderboard and dashboard "top scholars" widgets used to run a full `getDocs` over every
  participant's `users` doc *every time anyone, anywhere, answered a practice question* —
  because both listened to `dailyPractice` in real time and recomputed from scratch on every
  snapshot. With even a small number of active students, that fans out multiplicatively
  (open tabs × unique participants × questions answered) into tens of thousands of reads from
  ordinary use. Fixed by caching resolved profiles per session (`useRef`) and only fetching
  IDs not already cached (`Leaderboard.tsx`, `Dashboard.tsx`).
- **Prefer one-time fetches for admin analytics/reporting**, refreshed on demand, over live
  listeners — an admin dashboard doesn't need sub-second freshness, and a live listener on a
  collection that gets written to by every user action turns every such write into a read for
  every open admin tab. This is why the Engagement Analytics section above is a manual-refresh
  fetch rather than `onSnapshot`.
- **Bound analytics queries by a date range** (`login_events`, `dailyPractice` are both
  queried with `where('date(Key)', '>=', cutoff)`) so read cost doesn't grow unboundedly as
  historical data accumulates.
- If Firestore usage looks abnormally high relative to real user activity, the first thing to
  check is: which components hold an `onSnapshot` on a whole collection, and does that
  collection get written to by common user actions? `AdminDashboard.tsx`'s various manager
  tabs each hold such listeners, but they're scoped to only mount while that specific tab is
  open — if usage spikes again, check whether an admin is leaving one of those tabs open for
  long periods during high user activity.

## Deployment

- `netlify.toml` builds the frontend (`npm run build` → `dist/`) for static hosting on
  Netlify; note this does **not** run the Express server, so any deployment target for this
  app needs to run `server.ts`/`dist/server.cjs` (e.g. `npm run start`) to serve `/api/*`.
- Given the AI Studio artifacts in this repo, this app may also be deployed/managed directly
  through Google AI Studio's app hosting, which would run both the frontend and `server.ts`
  together. Confirm which path is actually in use before assuming a `netlify.toml` change
  alone will ship an update.
- Firestore rules are a separate deploy step — see [Security model](#security-model) above.
