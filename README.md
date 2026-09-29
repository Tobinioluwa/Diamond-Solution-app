# Diamond Solution

A study/exam-prep platform for students across Africa: structured course content, practice
quizzes, a leaderboard, an affiliate/referral program, and an admin back office.

- **Frontend**: React 19 + Vite + Tailwind, client-side routed with `react-router-dom`.
- **Backend**: A single Express app (routes in `server-app.ts`) providing a small `/api/*`
  surface, using the **Firebase Admin SDK** for privileged operations. It runs two ways from
  the same code: `server.ts` starts it as a long-running process (local dev, or any Node
  host) serving the frontend too; `netlify/functions/api.ts` wraps it as a Netlify Function
  for the actual Netlify deployment. See [Deployment](#deployment).
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

### Going live with Paystack

`VITE_PAYSTACK_PUBLIC_KEY`/`PAYSTACK_SECRET_KEY` accept either Paystack's **test** keys
(`pk_test_...`/`sk_test_...`) or **live** keys (`pk_live_...`/`sk_live_...`). To accept real
payments:

1. In the Paystack dashboard, switch to Live mode and copy the live key pair.
2. Set them as `VITE_PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY` in your actual deployment
   environment's env vars — not in a file committed to git.
3. Redeploy so `server.ts` (which serves the public key to the client via
   `/api/paystack-config`, and does all secret-key verification) picks up the new values.
4. Do one small real transaction post-deploy to confirm verification succeeds end-to-end.

The client-side "DEBUG MODE: SIMULATE payment?" fallback (shown when no valid public key is
configured) and the server's matching `sim_`-prefixed reference bypass only activate outside
production (`import.meta.env.DEV` / `NODE_ENV !== 'production'`) — see
[Operational notes](#operational-notes--lessons-learned).

## Project structure

```
server-app.ts               Express app + all /api/* routes (Firebase Admin SDK)
server.ts                  Long-running-process entry point: createApp() + static hosting
netlify/functions/api.ts    Netlify Function entry point: createApp() wrapped with serverless-http
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
| `payments/{id}` | Course/reactivation payments (Paystack). Client-writable in neither case - only the server writes `status: 'success'` here, via the Admin SDK, after independently verifying the transaction. See [Payment & access model](#payment--access-model) below. |
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
of the following is true (see `isAdmin()` in `firestore.rules`, `checkIsAdmin()` in `server-app.ts`,
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

## Backend API (`server-app.ts`)

All routes are mounted on one Express app (see [Deployment](#deployment) for how it actually
runs). `verifyFirebaseToken` middleware validates the caller's Firebase ID token; admin-only
routes additionally call `checkIsAdmin(uid)`.

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Liveness check |
| `POST /api/otp/request` | none (rate-limited) | Generates + emails an OTP for a purpose (device verification, reactivation, password change) |
| `POST /api/otp/verify` | none (rate-limited) | Checks a 6-digit code, returns a short-lived (15 min) signed JWT proving that purpose was verified for that user - consumed by `/api/complete-device-reactivation` |
| `POST /api/send-otp` | none | Sends a specific OTP code by email |
| `POST /api/verify-departmental-payment` | Firebase ID token | The **only** place a course/department purchase is granted - see [Payment & access model](#payment--access-model) |
| `POST /api/verify-reactivation-payment` | Firebase ID token | The **only** place a suspension/device-block reactivation fee is granted - see [Payment & access model](#payment--access-model) |
| `POST /api/complete-device-reactivation` | Firebase ID token | Final step of a device-block reactivation: consumes the OTP JWT from `/api/otp/verify` to swap the registered device and restore access |
| `POST /api/activate-affiliate` | Firebase ID token | Activates affiliate status for self, or (admins) another user |
| `POST /api/payout` | Firebase ID token (rate-limited) | Initiates a Paystack payout for self, or (admins) another user, after recomputing their real commission balance server-side |
| `POST /api/translate` | none | Gemini-powered French translation of quiz content |
| `POST /api/admin/delete-user` | Firebase ID token, **admin only** | Deletes a user's Firebase Auth account + their `users/`/`admins/` Firestore docs. Client SDKs can't delete another user's Auth account — this is why it's a server route. |
| `POST /api/public-profiles` | Firebase ID token (any signed-in user) | Given a batch of user IDs, returns **only** `displayName`/`department`/`role` for each. Used by the leaderboard, dashboard, and admin analytics so the client never needs a broad Firestore read on `users` (which also holds email/balance/bank details) just to show a name. |

## Payment & access model

**The current model is one-time, per-department, lifetime access — not a subscription.**
There is no expiry field anywhere in the schema and no time-based check anywhere in the code.
Once a student pays for a department, they keep access to it forever, unless an admin
suspends their account (which blocks the whole account, not just that department) or deletes
them. If the intent is for access to expire (e.g. per academic year), that is **not
implemented** - see "If you want time-limited access instead" below.

### How a purchase happens

1. **Client** (`CourseList.tsx` / `CourseDetail.tsx`) opens the Paystack checkout widget for
   the department's price (from `DEPARTMENT_PRICES` in `src/constants.ts`, or a `faculties/{id}`
   doc if an admin has overridden that department's price).
2. On Paystack success, the client calls `POST /api/verify-departmental-payment` with just the
   `reference`, `department`, `currency`, and the referrer's uid (if any) - **not** the amount.
3. The server (`server-app.ts`) is the only thing that grants access. It:
   - Looks up the department's real price itself (`getDepartmentPrice()` - same
     `faculties`-override-else-`DEPARTMENT_PRICES` logic as the client, so nobody can pay a
     token amount and claim a full-price purchase).
   - Calls Paystack's `/transaction/verify/:reference` directly with the secret key, and checks
     `status === "success"` **and** that the verified `amount`/`currency` match the department's
     real price exactly.
   - Checks the reference hasn't already been used for a different payment record (no
     replaying one real transaction to unlock multiple departments).
   - Only then writes, via the Admin SDK (which bypasses `firestore.rules` entirely - the
     client cannot perform any of these writes itself, see [Security model](#security-model)):
     - `payments/dept_pay_{uid}_{department}` with `status: 'success'` - this exact doc ID and
       status is what `firestore.rules` checks to gate `courses/{id}/content/{id}` reads, i.e.
       **this document *is* the department's access grant**.
     - `users/{uid}.hasPaidCourse = true` - a coarser "has paid for *something*" flag used by
       the affiliate program gate and the payout eligibility check, not per-department.
     - `affiliates/comm_{paymentId}` - the referrer's commission, computed server-side from the
       verified price (never trusts a client-supplied commission amount).
4. Reactivation (after a suspension or a third-device block) works the same way through
   `/api/verify-reactivation-payment`, writing `payments/{reference}` and either
   `users.status = 'active'` (standard suspension) or `users.reactivationPaid = true` (device
   block, which then requires completing OTP verification via `/api/complete-device-reactivation`
   before the device swap actually happens).

### How access is actually enforced

Two independent checks, both server/rules-side - the client's UI state is just a reflection
of these, never the source of truth:

- **Content gating**: `firestore.rules`' `courses/{id}/content/{id}` `allow read` checks for a
  `payments/dept_pay_{uid}_{department}` doc with `status == "success"` (or the legacy
  per-course `payments/{uid}_{courseId}` form). This is the actual paywall.
- **`hasPaidCourse`**: gates the affiliate program and payout eligibility, not course content.
  Only ever set by the server (`firestore.rules` blocks a user from setting this on their own
  `users` doc).

### How a returning user checks what they've paid for

- **Payment History page** (`/payments`, `src/pages/PaymentHistory.tsx`, linked from Profile) -
  lists every payment on the account (department/purpose, amount, date, reference, status)
  with a printable receipt. This is the direct answer to "how do I know if I've paid before."
- **The course list itself** (`/courses` → pick a department) shows an "Authorized" badge and
  unlocks content immediately for any department with a successful payment - this is a live
  Firestore listener on the user's own `payments` docs (`where('userId', '==', uid)`), so it's
  always current, not cached.
- There is currently **no explicit "your access is valid until X" indicator anywhere**, because
  there is no "until X" - access doesn't expire. If that's surprising, see below.

### If you want time-limited access instead

Nothing about the write path stops you from adding an `expiresAt` timestamp to the payment
grant, but three places would all need to agree on it, or a user could still get permanent
access through whichever one lags behind:

1. `firestore.rules`' `courses/{id}/content/{id}` read check would need
   `get(...).data.expiresAt > request.time` alongside the existing `status == "success"` check.
2. `/api/verify-departmental-payment` would need to write that `expiresAt` when granting access.
3. Something (a scheduled Cloud Function, or a check on next login) would need to flip
   `hasPaidCourse`/`status` back when access lapses, since nothing currently re-checks a grant
   after it's made.

Flagging this as a deliberate design question rather than implementing it speculatively - the
one-time-fee model may well be the intended business model (the client UI already labels it
"One-Time" fee), in which case there's nothing to fix here.

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
- **Never `navigate()` to a protected route immediately after a Firebase Auth sign-in call
  resolves.** `AuthContext`'s `onIdTokenChanged`/profile listeners haven't necessarily updated
  `user`/`loading` yet on that same tick, so `ProtectedRoute` can briefly still see `user: null`
  and bounce straight back to `/login` before the real state lands a moment later — a visible
  redirect flicker. All three login paths in `Login.tsx` (password, biometric, OTP
  device-verification) delay the post-login `navigate()` by 500ms for this reason; keep that
  pattern for any new sign-in flow.
- **Payment "simulate" bypasses must be hard-gated to non-production, not just to "no key
  configured."** The Paystack integration has a local-dev convenience — a `sim_`-prefixed
  reference skips real gateway verification — used by "DEBUG MODE" buttons that appear
  whenever `VITE_PAYSTACK_PUBLIC_KEY` is missing/placeholder (`CourseDetail.tsx`,
  `CourseList.tsx`, `Reactivation.tsx`) and honored server-side in
  `/api/verify-departmental-payment` (`server.ts`). A missing/placeholder key is not proof of
  "we're in development" — it's equally what a misconfigured production deploy looks like — so
  both sides now additionally require `import.meta.env.DEV` / `NODE_ENV !== 'production'`.
  Before this fix, any signed-in user could grant themselves a paid course for free by
  submitting a fabricated `sim_` reference directly to the endpoint, in any environment.
- **A missing/invalid Paystack key was *also* silently granting success**, independent of the
  `sim_` bypass above: `/api/verify-departmental-payment`'s `noKey` branch (when
  `PAYSTACK_SECRET_KEY` isn't a real `sk_...` key) skipped the gateway verify call entirely
  and fell through to `{success: true}` regardless of environment - so a misconfigured or
  missing production key granted every course purchase for free, silently, with no error
  anywhere. Same fix applied to `/api/payout`'s equivalent "no key, simulate" branch. Both
  now refuse with a clear error in production instead of pretending to succeed.
- **[FIXED] Two payment-record integrity gaps**: `firestore.rules` used to let any signed-in
  user `create` a `payments` doc with `status: 'success'` directly (the server never wrote
  this itself), and let the *referred* user in an `affiliates` commission record self-assign
  an arbitrary `commissionAmount` to any `referrerUid` - combined with the admin-approved
  payout flow, a fabricated commission was a path to a real Paystack transfer if not caught
  before approval. Fixed by moving all payment/commission record creation into
  `/api/verify-departmental-payment` (and the reactivation equivalent) via the Admin SDK, and
  restricting `firestore.rules` so `payments`/`affiliates` can only be written by an admin (the
  server bypasses rules via the Admin SDK, so this doesn't block the legitimate write path).
  See [Payment & access model](#payment--access-model) above.
- **[FIXED] The `users` update rule's suspension/device-block gate was vacuous**: it allowed
  `incoming().status` to be any of `['active', 'device_blocked', 'suspended']` unconditionally
  — which is the complete set of valid values, so the clause never actually restricted
  anything. A suspended or device-blocked user could set their own status back to `active`
  directly, bypassing the reactivation payment entirely — same category of "a clause that
  reads like a filter but is true for every possible value" as the `users` list-rule bug
  elsewhere in this file. Fixed: a user can now only self-escalate `status` *into* a
  restricted state (`active` → `device_blocked`/`suspended`); only the server can move it back
  out, and only after real payment (+ OTP, for the device-block path) verification.
- **The live Firestore database's rules had drifted further than the repo's `firestore.rules`
  file.** The two fixes above were written and merged into this repo well before the *deployed*
  rules were updated to match - editing `firestore.rules` here does nothing to the live
  database until someone explicitly publishes it (see "Deploying rule changes" above). Worse,
  when the deployed rules were finally compared against this file, the live version turned out
  to also have `allow get: if true` on `/users/{userId}` (any signed-out client could read any
  user's profile by UID) and an `allow list` clause containing a stray `|| true` (making the
  whole condition unconditionally true for any signed-in user - i.e. the entire `users`
  collection was listable by any student). Neither of those ever existed in this repo's
  `firestore.rules`; they were changes made directly against the live database outside of this
  codebase. **Lesson: after any `firestore.rules` edit, read back the actual deployed rules
  from the Firebase Console and diff them against the file in this repo - don't assume they
  match.**
- **A second, unbounded-Firestore-listener outage, distinct from the leaderboard/dashboard fix
  above.** `AdminDashboard.tsx` (and, missed in the first pass, `WhatsAppDirectoryManager.tsx`)
  held at least 9 separate `onSnapshot` listeners subscribed to entire collections
  (`users`, `payments`, `withdrawals`, `affiliates`, `chats`) with no `where()`/`limit()`. Each
  one re-reads the whole collection the moment its tab mounts, then stays live and
  re-delivers on *every* write to that collection anywhere in the app - every student login,
  every payment - for as long as any admin has that tab open. This is what actually exhausted
  the Firestore free-tier daily read quota (60k reads in a day against a 50k limit) and took
  the whole app down, project-wide, until the quota reset - confirmed against the Firebase
  usage graph, where total reads spiked to 60k while "real-time" listener reads were only
  ~6.3k, i.e. it was repeated full-collection *loads*, not steady live traffic. Fixed by
  converting all of them to one-time `getDocs()` loads; left `faculties`/`courses` (small,
  admin-curated catalogs that don't scale with user/payment volume) as live listeners. See the
  git history for `AdminDashboard.tsx`/`WhatsAppDirectoryManager.tsx` for the specific commits.
  **This project's Firestore database also runs on an AI-Studio-provisioned shared quota (see
  the project description at the top of this file), not a standalone billed Firebase project -
  the quota-exceeded error explicitly stated billing would not lift the limit. If usage grows,
  migrating to a standalone Firebase project may be necessary, not just optimizing reads
  further.**

## Deployment

This app is deployed on **Netlify**, which only ever serves static files - it has no way to
keep a Node process listening. Since all of `server.ts`'s API routes (`/api/*` - OTP,
payment verification, payouts, admin actions, the WhatsApp webhook, everything) need a real
server, the same Express app is also wrapped as a **Netlify Function**:

- `server-app.ts` holds every route (this used to be the whole of `server.ts`) and exports
  `createApp()`, which builds and returns the Express app without starting it or adding
  static-file middleware.
- `server.ts` is the thin entry point used for local dev (`npm run dev`) and for `npm run
  build`/`npm run start` if this is ever run as a real long-running process on some other
  host: it calls `createApp()`, then adds the Vite dev middleware (or static file serving +
  SPA fallback in production) and `app.listen(...)`.
- `netlify/functions/api.ts` is the serverless entry point: it wraps the same `createApp()`
  with `serverless-http` and exports a Lambda-style `handler`.
- `netlify.toml` redirects `/api/*` to that function (`/.netlify/functions/api/:splat`,
  status 200) **before** the catch-all SPA redirect - order matters, since Netlify uses the
  first matching redirect rule. Netlify passes the *original* request path to the function
  in this case, so the Express routes (`/api/verify-departmental-payment`, etc.) don't need
  any path rewriting to match.

**Environment variables must be set in Netlify's own dashboard** (Site configuration →
Environment variables) - this repo has no way to see or set them. That includes everything
already documented above (Paystack, Brevo, Gemini, WhatsApp, `NODE_ENV=production`) plus one
Netlify-Functions-specific addition:

- `FIREBASE_SERVICE_ACCOUNT_KEY` - the full JSON contents of a Firebase service account key,
  as one string. Netlify Functions run on AWS, not Google Cloud, so the automatic credential
  discovery (Application Default Credentials) that works when this runs on a GCP-hosted
  platform doesn't apply here - a real service account must be supplied explicitly, or every
  Firestore/Auth Admin SDK call in `server-app.ts`'s `getFirestore()` fails. Generate one at
  Firebase Console → (gear icon) Project settings → Service accounts tab → "Generate new
  private key", then paste the entire downloaded JSON file's content as this variable's
  value. Treat it like a password - anyone with it has full admin access to the Firestore
  database and every user's Auth account.

Netlify Functions also have a request timeout (10s on the free tier) - if a route ever needs
to wait on a slow upstream call (Paystack, Brevo) longer than that, it will time out where a
long-running Node process wouldn't have. Worth knowing if a request that works locally times
out only in production.

Firestore rules are a separate deploy step — see [Security model](#security-model) above.
