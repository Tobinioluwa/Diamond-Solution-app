# Diamond Solution — Full Functional Specification

This document describes **what the app does**, screen by screen and rule by rule, independent
of how it's currently implemented. It exists so the product can be rebuilt (in this codebase
or a new one) without re-discovering behavior by reading 15,000+ lines of React across ~40
files. For *how* the current codebase is organized, its data model, security rules, and
deployment, see [README.md](./README.md) — this file is the functional companion to that one.

Everywhere a number, formula, threshold, or hardcoded value appears below, it is called out
explicitly and verbatim, because those are the details a rebuild is most likely to silently
drop or "round off."

**Brand voice**: the product calls itself "Diamond Solution" / "Diamond Academy," users are
"Scholars," and copy throughout uses an "institutional/security-protocol" register — "Protocol
Launch Configurations," "Institutional Synthesis," "Security Clearance," "Query institutional
support" — rather than plain conversational UI text. This tone is consistent across both
supported languages (English and French) and across the student app and the admin back
office alike. A rebuild should decide deliberately whether to keep or normalize it, rather than
losing it by accident.

**Domain**: a clinical / medical-sciences MCQ exam-prep platform (the Login screen's
disclaimer — "Diamond Solutions is an independent study platform and is not affiliated with,
endorsed by, or sponsored by ASCP BOC" — indicates it targets ASCP BOC-style certification
exam prep, e.g. medical laboratory science), aimed at students across Africa, pricing primarily
in Nigerian Naira (₦) with a USD ($) alternative for other African countries.

---

## Table of contents

1. [Splash / landing screen](#1-splash--landing-screen)
2. [Authentication — Login / Register](#2-authentication--login--register)
3. [Global auth & session state](#3-global-auth--session-state)
4. [Multi-device login limit & device blocking](#4-multi-device-login-limit--device-blocking-core-business-rule)
5. [Biometric (fingerprint) login](#5-biometric-fingerprint-login)
6. [Onboarding tour](#6-onboarding-tour)
7. [Profile screen](#7-profile-screen)
8. [Account settings](#8-account-settings-screen)
9. [Reactivation (suspension / device-block recovery)](#9-reactivation-screen)
10. [Dashboard (home screen)](#10-dashboard--home-screen)
11. [StudyPage (practice/exam-taking)](#11-studypage--practiceexam-taking-screen)
12. [CourseList (browse departments/courses)](#12-courselist--browse-departmentsfaculties--courses)
13. [CourseDetail (single course)](#13-coursedetail--single-course-detail-screen)
14. [ActivityLog ("Revision Center")](#14-activitylog--revision-center)
15. [Leaderboard](#15-leaderboard)
16. [Affiliate / referral program](#16-affiliate-dashboard--referral-program)
17. [Payment History](#17-paymenthistory--receipts)
18. [Notifications](#18-notifications--notification-center)
19. [Chat (student support)](#19-chat--student-support-chat)
20. [Admin back office](#20-admin-back-office)
21. [Shared infrastructure](#21-shared-infrastructure)
22. [Cross-cutting business rules — cheat sheet](#22-cross-cutting-business-rules--cheat-sheet)
23. [Known issues / deliberate decisions for a rebuild](#23-known-issues--deliberate-decisions-for-a-rebuild)

---

## 1. Splash / landing screen

**File**: `src/pages/Splash.tsx`. The first screen any visitor sees — a marketing gate before
auth that routes into signup or login. No auth checks happen here.

- Full-screen branded page: vertical Diamond logo (logo + wordmark + tagline), a decorative
  "diamond-mesh" background with two radial gradient blobs, background color `#F4F7FE`.
- Language toggle (EN/FR pills, top-right) — calls the site-wide `setLanguage`, not scoped to
  this screen.
- Localized tagline (italic serif).
- A 3-column "stats bar": **"5+" Departments, "15,000+" Questions, "25% Commission"** —
  hardcoded marketing numbers, not live data.
- Two CTAs: 💎 "Initiate" (sign-up) → `/register`; "Sign In" (secondary) → `/login`.
- Footer disclaimer: *"Diamond Solutions is an independent study platform and is not
  affiliated with, endorsed by, or sponsored by ASCP BOC."*
- **Referral capture**: if the URL has `?ref=<code>`, the code is saved to
  `sessionStorage['referralCode']` on mount (last-seen-wins if visited twice with different
  codes). Both CTAs re-attach `?ref=<code>` onto `/register`/`/login` so it survives
  navigation; if the URL has no `ref` param, whatever is already in `sessionStorage` is reused.
  The code is never server-validated at this stage — just captured for later.

---

## 2. Authentication — Login / Register

**File**: `src/pages/Login.tsx`. One unified component renders Sign In, Create Account
(2-step wizard), Forgot Password, Email-OTP verification, and Biometric unlock, swapped by
tab/state. Routes `/login` and `/register` both render it, differing only in default tab (read
from the pathname and `?mode=signup|login`).

### 2.1 Shell

- Tab bar: "Sign In" / "Create Account," underlined active state (blue `#0A33CC`). Switching
  tabs updates the URL and resets form state (forgot-password mode, OTP step, wizard step).
- A dismissible security/info modal can auto-open from `?reason=` (produced by
  `SessionService.forceSignOut()` redirects, see §3):
  - `reason=multi_device` → "Multiple Device Login" / "Your account has been logged in on
    another device. You have been signed out to protect your account security."
  - `reason=session_expired` → "Session Expired" / "Your session has expired due to
    inactivity. Please log in again."
- Footer disclaimer (same ASCP BOC text as Splash).
- "Institutional Support Archives" social links section — loaded from Firestore
  `settings/institutional_links` (telegram/whatsapp/facebook/twitter/instagram), falling back
  to hardcoded defaults (Telegram `t.me/diamondsolution`, WhatsApp `+2347065969567`,
  Instagram/Facebook/X `@diamondsolution`) if that doc doesn't exist.
- Department/faculty list for registration = static `DEPARTMENTS` constant **merged with**
  custom Firestore `faculties` docs (minus any flagged `isDeleted`), de-duplicated. If the
  currently-selected department falls out of this list, it auto-resets to the first option.

### 2.2 Sign In

Fields: Email, Password (masked, show/hide toggle). "Forgot password?" link beside the label.

Flow on submit:
1. Sets an in-memory `PENDING_LOGIN` sentinel (`setSessionToken`) — this exists purely to stop
   the global profile listener (AuthContext, §3) from misreading the in-flight login as a
   multi-device conflict and kicking the user mid-login.
2. `signInWithEmailAndPassword` (Firebase Auth).
3. Fetches `users/{uid}`.
4. **Self-healing profile creation**: if no profile doc exists for an authenticated user, one
   is auto-created with: `role: 'student'`, a fresh referral code (`DS` + 6 random uppercase
   alphanumeric chars), `affiliateStatus: 'active'`, `isAffiliate: true`, `isPartner: true`,
   `hasPaidAffiliateFee: true` (**every user is auto-enrolled as an active, fee-waived
   affiliate partner** — see §16), `hasSeenTour: true`, `hasSeenProfessionalTour: false`,
   `balance: 0`, `currency: 'NGN'`, `institutionalName`/`university` defaulted to a
   `DEFAULT_UNIVERSITY` constant, `emailVerified: false`.
5. Device-limit enforcement runs for non-admin users (§4).
6. `SessionService.startSession(uid)` (§3).
7. Optionally enrolls biometrics if "Enable Fingerprint Quick Unlock" was checked (§5).
8. Forces an ID-token refresh, clears the tab's onboarding-tour-shown flag (so the tour can
   show again — §6), waits **500ms** (deliberately, so AuthContext's listener updates before
   `ProtectedRoute` checks `user` — otherwise a login→redirect flicker happens), then
   navigates to `/dashboard`, or to `/reactivate` if the profile's `status` is `suspended` /
   `device_blocked` / `deviceBlockPending`.

### 2.3 Create Account — 2-step wizard

**Step 1**: Full Name, Username (auto-lowercased, spaces stripped), Institution/University
(free text), Department (select, from the dynamic faculty list), WhatsApp Number (country-code
select of 47 African countries with flag + dial code, paired with a phone field). "Next →"
advances with no validation beyond HTML `required`.

**Step 2**: Email, Password (masked + toggle), Confirm Password (masked + toggle), Referral
code (optional, pre-filled from `?ref=`/sessionStorage, placeholder `DSXXXXXX`).

**Password rules (registration only — Sign In enforces none of this)**:
- ≥ 8 characters
- ≥ 1 uppercase, ≥ 1 lowercase, ≥ 1 digit, ≥ 1 special character
- Must match Confirm Password
- Generic failure copy: "Passwords do not match" / "Password too weak"

**On submit**:
1. Sets `PENDING_LOGIN` sentinel.
2. `createUserWithEmailAndPassword`.
3. Computes a SHA-256 device fingerprint (`${userAgent}-${screenWxH}-${timezone}`) — this
   value is computed but not actually what's checked for the 2-device cap (see §4's note on
   three independent device identifiers).
4. **Referral resolution**: takes the code from the URL `?ref=` first, else the typed field;
   normalizes (uppercase, strip `-`, prefix `DS` if missing) and also computes a legacy
   `DS-XXXXXX` form; queries `users` where `referralCode` is either form to find the referrer,
   capturing their uid as `referredByUid`.
5. **Currency assignment**: Nigeria (+234) → `NGN`; every other African country in the list →
   `USD` — i.e. only Nigeria gets its own currency.
6. Writes `users/{uid}` (before any OTP step, to satisfy Firestore create-schema rules):
   uid, email, displayName, username, institutionalName/university (`formatUniversityName`),
   department, phone/whatsapp/whatsappNumber (all = countryCode+number), `role: 'student'`,
   createdAt, a fresh own referral code, `referredBy`/`referredByUid`, `affiliateStatus:
   'active'`, `isAffiliate: true`, `isPartner: true`, `hasPaidAffiliateFee: true`,
   `hasSeenTour: true`, `hasSeenProfessionalTour: false`, `balance: 0`, currency, language,
   `emailVerified: false`, `registeredDeviceIds: [currentDeviceId]` (this device registers as
   device #1 of the 2-device cap — see §4).
7. Starts a session (§3).
8. Forces ID-token refresh.
9. Fires `POST /api/otp/request` `{userId, email, purpose: 'registration'}`. If
   `emailSent === false`, shows a dev-only alert revealing where to find the code in
   `system_logs`.
10. **Immediately signs the user out** and switches to the Sign-In tab with "Institutional
    Verification protocol initiated. Check your email to confirm registration, then sign in."
    — deliberate, per code comments, "so they are directed to login page after registration."
11. *(Structural note: a fully-built inline OTP-verification step for registration exists in
    the component but is never reached by this flow — see §23.)*

### 2.4 Forgot Password

Toggled from Sign In. Single Email field → `sendPasswordResetEmail`. Success shows a green
checkmark confirmation and hides the submit button. "Back" returns to Sign In. Errors go
through a shared friendly-error-message mapper.

---

## 3. Global auth & session state

**Files**: `src/context/AuthContext.tsx`, `src/lib/SessionService.ts`.

AuthContext is the single app-wide source of truth (`useAuth()`) for who's logged in, their
role, and whether they should be force-logged-out right now. Exposes `user` (raw Firebase Auth
object), `profile` (live Firestore `users/{uid}` doc), `loading`, `isAdmin`, `isModerator`,
`isVerified`.

**Role rules**:
- `isAdmin` = `profile.role === 'admin'` **OR** the signed-in email equals the hardcoded
  super-admin address `peteradekunle923@gmail.com` — this bypass works **even with no
  profile document at all**.
- `isModerator` = `profile.role === 'moderator'`.
- `isVerified` = `profile.emailVerified === true`.

**Inactivity auto-logout — exactly 30 minutes, two independent triggers**:
1. Tab-visibility: on `visibilitychange`, if the tab was hidden for > 30 min before becoming
   visible again, force-sign-out with reason `session_expired`.
2. Cross-reload: on every `onIdTokenChanged` firing, compares `localStorage['last_active_{uid}']`
   against now; > 30 min elapsed → same force-sign-out.
3. `last_active_{uid}` is refreshed on real interaction (`mousemove`, `keydown`, `click`,
   `scroll`), which is what keeps the clock from firing during actual use.

**Single active session enforcement** (independent of, and stacked on top of, the 2-device
cap in §4):
- `users/{uid}.sessionToken` is rewritten fresh on every successful login
  (`SessionService.startSession`). The browser keeps its own copy in
  `localStorage['session_token_{uid}']`.
- Every live profile snapshot compares the two. If `inMemorySessionToken === 'PENDING_LOGIN'`
  (set during the in-flight login described in §2.2/§2.3), the comparison is **skipped** —
  this is the race-condition guard preventing a user from being kicked by their own
  brand-new login.
- Outside that window, a mismatch → force-sign-out with reason `multi_device`.
- **Net effect**: logging in on *any* device — even one of the 2 permitted ones — immediately
  invalidates any other currently-open session on the account. The 2-device cap governs which
  devices may ever log in; concurrency is always capped at exactly **1 live session**,
  regardless of how many devices are registered.

### SessionService methods

- `startSession(uid)`: generates a new token (`crypto.randomUUID()` or manual fallback);
  writes it + `lastLoginAt` to `localStorage` and to `users/{uid}` (merge); also writes a
  backup copy to `user_sessions/{uid}` (best-effort, failures swallowed); fires-and-forgets an
  `addDoc` into `login_events` — `{uid, timestamp, dateKey (precomputed yyyy-MM-dd), hour
  (precomputed 0-23)}` — a permanent, append-only per-login audit row that exists specifically
  to power admin "visit frequency / peak hours" analytics without needing to scan full docs.
- `clearSession(uid)`: clears both localStorage keys and the in-memory sentinel; nulls
  `sessionToken`/`sessionDeviceId` on both `users/{uid}` and `user_sessions/{uid}`. Called from
  Profile's Sign Out.
- `validateSessionOnServer(uid)`: compares local vs. Firestore token; **fails open** (returns
  `true`, i.e. doesn't boot the user) if the Firestore read errors because the client is
  offline — a deliberate leniency.
- `validateIdToken(uid)`: forces an ID-token refresh to detect server-side Firebase account
  revocation.
- `forceSignOut(reason)`: reason ∈ `'multi_device' | 'session_expired'`. Clears localStorage,
  calls Firebase `signOut`, then hard-redirects (`window.location.href`) to
  `/login?reason=<reason>`.

There is no device-*limit* logic inside SessionService itself — only "one active session at a
time." The 2-device registration cap and 24-hour block live in Login.tsx/Reactivation.tsx
against `registeredDeviceIds` (§4).

---

## 4. Multi-device login limit & device blocking (core business rule)

Applies identically on password Sign In and Biometric Unlock. **Admins are completely
exempt** — `role === 'admin'` OR the hardcoded email `peteradekunle923@gmail.com`.

- Each browser/device holds a persistent local ID: `getOrGenerateDeviceId()` — format
  `device_<random>_<timestamp36>`, stored at `localStorage['diamond_device_id']`, generated
  once and reused forever on that browser/profile.
- `users/{uid}.registeredDeviceIds: string[]` holds every device ID that has ever logged in.
- **On every login**:
  - Device ID already in the array → no-op (known device).
  - Array length `< 2` → append this device ID (**up to 2 devices registered "for free"**).
  - Otherwise (a 3rd, unknown device) → **block the account**, unless already blocked
    (idempotent against `status === 'device_blocked'` / `deviceBlockPending`). Blocking sets:
    `status: 'device_blocked'`, `deviceBlockPending: true`,
    `blockedUntil: now + 24h (24 * 60 * 60 * 1000 ms)`, `reactivationPaid: false`.
- **Exact limit: 2 trusted devices per account.** The 3rd distinct device triggers the block.
- The 3rd device's sign-in itself still *succeeds* — the block only changes the post-login
  redirect, which sends the user to `/reactivate` instead of `/dashboard` whenever
  `status === 'suspended' || status === 'device_blocked' || deviceBlockPending`.
- Three independent, un-reconciled local device identifiers exist across the app: the
  general login-cap ID above, a separate biometric-cross-device ID (§5), and the ephemeral
  SHA-256 "deviceInfo" hash computed inline during login/registration (written to Firestore as
  session metadata, but **not** what's checked against the 2-device cap).

See §9 for the full device-block recovery flow (24-hour wait → payment → OTP → device swap).

---

## 5. Biometric (fingerprint) login

**File**: `src/lib/biometrics.ts`, wired into Login.tsx. A thin convenience layer over
WebAuthn's platform-authenticator API — under the hood it is **always just "auto-fill +
auto-resubmit the normal email+password login."** There is no separate server-side biometric
verification; Firebase Auth still authenticates by password.

- `isBiometricsSupported()`: `window.PublicKeyCredential` exists AND
  `isUserVerifyingPlatformAuthenticatorAvailable()` resolves true.
- **Credential storage**: a single JSON blob at `localStorage['diamond_biometric_credentials']`
  — `{email, password (obfuscated), storedAt}`. **Not real encryption**: the password is
  obfuscated with repeating-key XOR against a hardcoded string
  (`"diamond-learning-key-928374982"`), then base64-encoded — recoverable by anyone with
  localStorage access and the key string, which ships in the client bundle. Flag this
  deliberately in a rebuild rather than reproducing it by default.
- A separate persistent `localStorage['diamond_device_biometric_id']`
  (`bio_dev_<random>_<timestamp36>`) is the ID compared against `users/{uid}.biometricDeviceId`
  to detect credential reuse across physical devices.
- `enrollBiometrics(email, password)`:
  1. Requires `window.PublicKeyCredential` and an already-authenticated Firebase user.
  2. **Unique-device guard**: queries `users` for any *other* account already carrying this
     device's biometric ID; if found, refuses with "This device is already enrolled to
     another account ({otherEmail})." — **one physical device can only have fingerprint
     unlock enrolled for one account at a time.**
  3. Real `navigator.credentials.create()` (rp name "Diamond Academy", ES256/RS256,
     `authenticatorAttachment: 'platform'`, `userVerification: 'required'`,
     `residentKey: 'required'`, 60s timeout).
  4. On success, writes `biometricDeviceId`/`biometricEnrolledAt` to the profile and stores
     the obfuscated credential blob locally.
  5. **Iframe handling**: if run inside an iframe (or the browser reports a Permissions-Policy
     error), throws a friendly "open this app in a new tab" error.
- `authenticateBiometrics()`: requires a stored credential; performs a real
  `navigator.credentials.get()` assertion and, on success, returns the de-obfuscated
  `{email, password}` for Login.tsx to feed into a normal sign-in.
- `clearBiometrics()`: wipes the local blob and the profile's biometric fields — used both for
  explicit "forget this device" and automatically on cross-device mismatch (below).
- On the Sign-In form, if biometrics are supported but not yet enrolled, a checkbox "Enable
  Fingerprint Quick Unlock" appears — checking it enrolls on successful password login (an
  enrollment failure, e.g. iframe restriction, only alerts; login still proceeds).
- If biometrics are already enrolled and the typed email matches, a "Switch to Fingerprint
  Quick Unlock" link appears.
- **Quick Unlock UI**: bouncing fingerprint icon, "Account: {enrolledEmail}," a big "Unlock
  with Fingerprint" button (becomes "Verifying Credentials..." while running), a "Sign in with
  password" escape hatch. Inside an iframe, a warning explains WebAuthn is blocked there and
  points at "Open App in a New Tab."
- **`handleBiometricUnlock` flow**:
  1. `authenticateBiometrics()` recovers `{email, password}`.
  2. Sets the `PENDING_LOGIN` sentinel, then does a **real** `signInWithEmailAndPassword`.
  3. **Cross-device theft guard**: fetches the profile and compares its `biometricDeviceId` to
     this browser's local biometric ID. Mismatch → immediately signs out, clears all local
     biometric credentials, resets enrolled-UI state, and throws "This fingerprint credential
     is registered on a different device and cannot be used on this device."
  4. Runs the same device-limit enforcement as normal login (§4).
  5. Starts a session (§3).
  6. Navigates to `/dashboard` or `/reactivate`, same as password login.

---

## 6. Onboarding tour

**File**: `src/components/OnboardingTour.tsx`. A full-screen animated walkthrough shown as a
modal over the dashboard.

- **Trigger**: 300ms after the user has a loaded `profile` AND
  `sessionStorage['diamond_onboard_shown'] !== 'true'` for this tab session. Login.tsx clears
  that flag on every explicit sign-in or registration-redirect — so the tour reappears **every
  fresh login**, not truly "once ever."
- **5 fixed slides**, auto-advancing every **6 seconds** (no visible manual "Next" — only a
  "skip introduction" link and an X close, both ending the tour the same way):
  1. "Welcome to the Elite Circle" (GraduationCap)
  2. "The 50-Question Protocol" — *"Top-tier scholars maintain a daily regimen of 50 targeted
     questions."* — reveals a recommended daily practice quota of **50 questions/day**.
  3. "Asset Redistribution ($DL)" (Sparkles) — introduces an in-app virtual currency "$DL"
     earned via quiz performance, redeemable for benefits (not otherwise implemented as a
     literal named currency elsewhere in the surveyed code — the actual mechanic is the Points
     formula in §10/§15).
  4. "Institutional Leaderboard" (Trophy) — confirms the competitive, accuracy-ranked
     leaderboard.
  5. "Secure Support Channels" (ShieldCheck) — points at the admin support chat.
- Dark navy modal, rotating gradient blobs, progress dots, "Protocol Version 3.1" label baked
  into copy. Finishing (skip, X, or completing all 5) sets
  `sessionStorage['diamond_onboard_shown'] = 'true'`.

---

## 7. Profile screen

**File**: `src/pages/Profile.tsx`. The account hub/menu — identity summary + navigation, no
editing here (edits happen in AccountSettings, §8).

- Header card: generic circular avatar (no photo upload anywhere in the app), a Shield badge
  overlay, `displayName` (localized default if missing), `@username` (blue monospace, if set),
  email (small uppercase), a role pill (`profile.role`, default "student").
- "Verification" card: Institution (`formatUniversityName`) and Contact (phone, or "not
  configured").
- "Settings" list: Notifications → `/notifications`; Activity Log → `/activity-log`; "Payment
  History" (hardcoded English, not localized unlike its siblings) → `/payments`; Account
  (Shield) → `/account`.
- "Partner Program" list: Affiliate Repository (Gift) → `/affiliate`; Support (HelpCircle) →
  `/chat`.
- **Admin button** — full-width, only rendered if `isAdmin` → `/admin`.
- Sign Out (red, LogOut icon): `SessionService.clearSession(uid)` (best-effort) →
  `signOut(auth)` → clear `diamond_onboard_shown` → `/login`.
- Footer: "Diamond Solution Academic v2.0" (version marker).

---

## 8. Account Settings screen

**File**: `src/pages/AccountSettings.tsx`. Reached from Profile's "Account" row; Back → `/profile`.

### 8.1 User Identity

Fields (pre-filled): Username (lowercased/stripped live), University/Institution (free text,
defaults to `DEFAULT_UNIVERSITY`), WhatsApp Number (free text, placeholder
`+2348012345678`).

On Save: writes `username`, `institutionalName` + `university` (both via
`formatUniversityName`), and `whatsapp`/`whatsappNumber`/`phone` (all three set to the same
new value) — merge update. Validation: username non-empty (blocked via plain `alert()`).
Confirms/errors via plain `alert()`.

### 8.2 Payout Credentials (bank details)

Fields: Bank (11 named Nigerian banks/fintechs with real bank codes — Access Bank `044`,
GTBank `058`, First Bank `011`, Zenith Bank `057`, UBA `033`, Union Bank `032`, Fidelity Bank
`070`, FCMB `214`, Kuda Bank `50211`, OPay Digital Services `999992`, PalmPay `999991`),
Account Number (max 10 digits, monospace), Account Name/Beneficiary (free text,
auto-uppercased).

On Save: writes `bankDetails: {bankName, accountNumber, accountName, bankCode}` (merge).
Confirms via `alert()`. This is where a user registers the account their affiliate payouts go
to (see §16).

### 8.3 Security Override (password change) — two-step, mandatory email OTP

**Step "form"**: Current Password, New Password, Confirm New Password (masked, no show/hide
toggle unlike Login). Validation: New === Confirm; New password **≥ 6 characters only** —
deliberately **weaker** than registration's 8-char/mixed-class rule (§2.3); no
uppercase/lowercase/digit/special-character requirement here. On submit: re-authenticates via
`EmailAuthProvider.credential` + `reauthenticateWithCredential` (validates the current
password AND refreshes Firebase's recency-of-auth trust needed for `updatePassword`). Reauth
failure stops here with a friendly error. On success: `POST /api/otp/request`
`{userId, email, purpose: 'password_change', name}` (same dev-bypass alert pattern as
registration), then advances to the "otp" step.

**Step "otp"**: single 6-digit input (digits-only, auto-stripped), "Security Token Required,"
target email shown; "Wait, go back" returns to the form step. On submit: `POST /api/otp/verify`
`{userId, purpose: 'password_change', code}`; failure → "Invalid security token." Success →
`updatePassword(user, newPassword)`, `alert()` confirmation, navigate to `/profile`.

Footer disclaimer: losing email access blocks password changes entirely, since email is the
sole verification vector.

**Rules summary**: password change needs correct current password (reauth) **+** a valid
6-digit email OTP, in that order; new-password minimum is 6 characters (weaker than signup's
rule — flag this inconsistency when rebuilding); bank fields have no checksum/format
validation beyond the 10-digit cap; identity/bank/password are three fully independent save
actions.

---

## 9. Reactivation screen

**File**: `src/pages/Reactivation.tsx`. The forced landing page for any account whose
`profile.status` is `suspended`, or is `device_blocked`/`deviceBlockPending`. It is the **only**
path back into the app for such accounts. Visiting it without a blocking condition immediately
redirects to `/dashboard`.

Two sub-flows, branching on `isDeviceBlocked = status === 'device_blocked' || deviceBlockPending`:

### 9.1 General "suspended" flow (e.g. inactivity)

- "Institutional access has been revoked due to inactivity protocol violation."
- **Fee: ₦1,000** (Nigerian accounts, or country unset — Nigeria is the default assumption)
  **or $2 USD** otherwise.
- "Authorize Reactivation" opens Paystack checkout (`react-paystack`) for the computed amount
  — NGN amount = ₦1,000 × 100 kobo; USD amount is converted to NGN-equivalent kobo at a
  **hardcoded rate of ₦1,500 = $1** (`feeUSD * 1500 * 100`), i.e. even the "USD-priced"
  reactivation is actually charged through Paystack in Naira.
- Paystack public key is fetched from `GET /api/config` (falls back to
  `VITE_PAYSTACK_PUBLIC_KEY`).
- **Dev-only bypass**: if no usable key is configured AND `import.meta.env.DEV`, a
  `window.confirm` offers to simulate a successful payment (fake reference
  `sim_reactivate_<timestamp>`). In production with no key, it instead refuses outright
  ("Payments are temporarily unavailable...") — a deliberate security guard, not a convenience
  gap.
- On a real/simulated success, the client **never trusts the callback alone**: it calls
  `POST /api/verify-reactivation-payment` (bearer-authenticated), and the server independently
  re-verifies the reference with Paystack (status/amount/currency/one-time-use) before writing
  anything. (Comments explicitly flag the old behavior — a pure client-side `status: active`
  write with no verification — as the vulnerability this replaced.)
- On server-confirmed success, for a plain suspension the account is reactivated immediately
  (hard redirect to `/dashboard`) — no OTP step needed.

### 9.2 Device-blocked flow (3rd-device login attempt)

"Security Protocol" / "Multi-device security threshold triggered." Multi-stage:

1. **Countdown stage**: while `now < blockedUntil`, a live `HH:MM:SS` countdown renders in a
   red "Temporary Lockout Countdown" panel. The payment button is **disabled for the entire
   24-hour window** regardless of payment readiness — **you cannot pay your way out early.**
2. **Post-countdown / pre-payment stage**: once expired, a green banner appears and "Compulsory
   Activation Fee: ₦1,000" becomes payable (flat fee, **no USD alternative** for this path,
   unlike §9.1). Three bullet rules shown to the user: max 2 registered devices; this device
   becomes primary; this immediately terminates all other active sessions. Same Paystack /
   server-verification / dev-simulate-bypass mechanics as §9.1.
3. **Payment-confirmed / OTP stage**: once the server confirms payment AND flags
   `isDeviceBlocked`, a "Payment Confirmed" banner shows and `handleRequestOtp()` auto-fires:
   `POST /api/otp/request {userId, email, purpose: 'device_reactivation'}`. "Resend Code"
   re-triggers it. User enters the 6-digit code → `POST /api/otp/verify
   {userId, purpose: 'device_reactivation', code}` → on success, a short-lived server-issued
   token is stored for the next step.
4. **Device-swap confirmation**: "Register This Device?" with an explicit warning that this
   logs out every other device. "No, Cancel" → `SessionService.forceSignOut('session_expired')`
   (abort to login). "Yes, Register" → `POST /api/complete-device-reactivation` (bearer auth)
   `{token, deviceId}` — the server atomically swaps the registered device and restores access,
   using the token as proof the OTP step actually completed (comments flag the prior version —
   a direct client-side Firestore write with no proof — as the vulnerability this replaced).
   On success, starts a brand-new session (which, per §3's single-session rule, immediately
   logs out any other device) and hard-redirects to `/dashboard`.

**Numbers summary**:
- Plain suspension fee: ₦1,000 (Nigeria) / $2 (elsewhere), charged in NGN via the fixed
  ₦1,500/$1 rate for non-Nigerian accounts.
- Device-block fee: flat ₦1,000, no currency alternative.
- Device-block lockout: exactly **24 hours**, hard-enforced independent of payment readiness.
- Device-block recovery order: (1) wait out 24h → (2) pay (server-verified) → (3) request +
  correctly enter a 6-digit email OTP → (4) explicitly confirm "Yes, Register," which
  terminates every other active session.
- Plain suspension recovery: pay only — no OTP, no device swap.
- All five server endpoints involved (`GET /api/config`, `POST /api/verify-reactivation-payment`,
  `POST /api/otp/request`, `POST /api/otp/verify`, `POST /api/complete-device-reactivation`)
  are, per code comments, specifically hardened server-side to prevent the client from
  self-granting reactivation or a device swap without real payment/OTP proof.

---

## 10. Dashboard — home screen

**File**: `src/pages/Dashboard.tsx`. The post-login landing page: standing (points/accuracy/
streak), resume-where-you-left-off, a 7-day analytics view, quick navigation, and social proof.

**Sections, top to bottom**:

1. **Hero header** — logo + wordmark, bell → `/notifications` (gold dot always shown, not tied
   to real unread count here); time-of-day greeting (`<12` morning / `<17` afternoon / else
   evening) + display name.
   - **Live search bar**: "Search a course, topic or exam (e.g. Hematology)...". Filters a
     locally cached full course list (title/department/level/code/objectives,
     case-insensitive substring) and shows up to 10 results: level badge, department, title,
     and "Unlocked" (green) or "Unlock Access" (amber/lock) depending on the user's paid
     departments. Unlocked → `/courses/:id`; locked → `/courses?department=X`. Submitting →
     `/courses?search=...`. Dropdown closes on outside click.
   - **3-stat strip**: Points, Accuracy, Attempted (flame icon) — all-time, from
     `dailyPractice` (formula below).

2. **"Wisdom of the Day"** — latest doc from `quotes` (ordered `createdAt` desc, limit 1);
   falls back to one hardcoded quote if the collection is empty.

3. **"Last Activity" / Continue Studying card** — SVG circular progress ring = accuracy %,
   plus the most-recently-updated course's title/level/"X of Y questions completed" and a
   "Resume Quiz →" button → `/courses/:courseId`. No activity yet → generic card (department
   name, ring defaults to 65% or the profile's `avgScore`).

4. **"Study Analytics" — 7-day block**: 4 tiles (Time Spent, Attempted, Correct Answers,
   Average Score) that switch between "7-Day Total" and a tapped day's numbers; a Recharts bar
   chart (one bar/day, last 7 calendar days, Mon/Tue labels) with a rich tooltip (minutes,
   attempted, correct, accuracy); 7 tappable day-pills mirror the chart (click to
   select/deselect, "Reset Selection" pill when a day is active). All from `dailyPractice`,
   aggregated client-side into a `yyyy-MM-dd`-keyed map, missing days render as zero.

5. **Departments carousel** — horizontal scroll of faculties (Firestore `faculties` or static
   `DEPARTMENTS` fallback); "Active" badge if paid; "Explore →" → `/courses?department=X`.

6. **Quick Actions grid**: Start Quiz → `/courses`; Leaderboard → `/leaderboard`; Refer & Earn
   (25%) → `/affiliate`; Channels → opens the social-media modal.

7. **Referral Program banner** — shows the user's referral code (`DSXXXXXX`), → `/affiliate`.

8. **"Top This Week" mini leaderboard** — up to 5 scholars, **filtered to the viewer's own
   department**, ranked by weekly points. Rank badge (gold gradient for #1), avatar initials,
   name + university, accuracy % + attempted, total points. Empty: "No rankings recorded yet
   for this department this week..."

9. **Social Media modal** (from "Channels") — same `settings/institutional_links` source as
   Login, or hardcoded defaults.

**Background behaviors**:
- **Auto affiliate activation**: on every load, if the profile lacks a `referralCode` or isn't
  `affiliateStatus: 'active'`, silently calls `POST /api/activate-affiliate`; on failure, falls
  back to a client-side `setDoc` setting the same fields (§16). Attempted once per session.
- "Paid departments" = `payments` where `userId == me AND status == 'success'` (reading
  `dept_name`/`department`), plus always the profile's own `department`.

**Points formula** (the single scoring mechanic — reused by Dashboard, Leaderboard, and
implicitly by `dailyPractice` aggregates):

```
Points = (Total Questions Attempted × 2) + (Total Correct Answers × 0.5)
```

Displayed to 1 decimal (integers shown without a decimal). **Not** the same as Accuracy %
(`correct / attempted × 100`, rounded to the nearest integer) — both shown side by side. This
rewards volume of attempts twice as much as raw correctness — a deliberate design choice to
encourage practice volume, not just accuracy.

**"Top This Week" aggregation** (also reused, department-unscoped, by the full Leaderboard):
- Reads `dailyPractice` where `date` falls between this week's Monday and Sunday, limit 500.
- Aggregates attempted/correct per `userId`.
- Resolves name/department/university via batched, authenticated `/api/public-profiles`, with
  a per-id direct `users/{uid}` read fallback.
- Filters to scholars whose department loosely string-matches the viewer's (normalized,
  non-alphanumeric stripped, substring either direction); entries with no department are kept
  regardless.
- Sort: points desc, then accuracy desc; top 5.
- University defaults to "University of Ibadan" if unset.

**Reads**: `faculties` (live), `courses` (cached, 5 min TTL — §12.x cache), `payments` (live,
user+success), `settings/institutional_links` (live), `quotes` (live, latest 1),
`dailyPractice` (live, user-filtered), `studyProgress` (live, user-filtered), ad hoc
`users/{uid}` lookups (leaderboard names), ad hoc `courses/{courseId}` (when the last-activity
course isn't cached).
**Writes**: `users/{uid}` merge (affiliate auto-activation fields); `users/{uid}` merge
(`referredByUid`, actually set during CourseList/CourseDetail payment flows, not here).

---

## 11. StudyPage — practice/exam-taking screen

**File**: `src/pages/StudyPage.tsx`. Where answers actually get taken: one question at a time,
timed, scored, auto-saved, with a celebratory "section complete" flow.

### Question types

- **Objective/MCQ** (default, unless the course's level is literally "Application Questions"):
  pick one lettered option (highlighted blue on select, not yet submitted). "Commit Solution"
  (disabled until an option is picked) submits. On submit: correct option → blue + checkmark;
  a wrong pick → red + X; everything else dims to 50% opacity. An "Institutional Synthesis"
  (explanation) panel appears if the question has one.
- **Application**: no options shown; "Check Answer" is always enabled (no selection required).
  On submit, an "Expected Response provided by System" panel reveals `answerText`/
  `explanation`. **Always scored as correct** (`isCorrect = true` hardcoded) — a self-check /
  flashcard mode, not auto-graded.
- Per-question text can auto-translate to French via `/api/translate` when `language === 'fr'`
  (cached per question, full-screen "Linguistic Sync" overlay while running).
- Text formatting is preserved via a shared `formatFormattedText` helper (line breaks survive
  CSV bulk import).

### Timer

- Per-question countdown: **60s for objective, 120s for application** — resets on index
  change. Shown as `{n}s`, turns red + pulses at ≤10s. Only runs while not loading/showing
  results and the current question isn't yet submitted.
- At 0: **auto-submits as unanswered/incorrect** (recorded as `selectedAnswer: null,
  isSubmitted: true`, logged to Activity Log as incorrect, counted in `dailyPractice`). Does
  not auto-advance — the student still clicks Next.
- A separate **study-duration timer** tracks total active session time, syncing to
  `dailyPractice.studyDuration` via `increment()` roughly every 2 minutes (checked every 30s,
  flushed on unmount).

### Progress persistence

- Local `answers` map keyed by question ID: `{selectedAnswer, isSubmitted}`.
- Picking an option (pre-submit) triggers a **debounced 10-second** save to
  `studyProgress/{uid}_{courseId}` (flushed immediately on unmount).
- Submitting triggers an **immediate** save of `currentIndex`, full `answers`, and recomputed
  `score: {correct, total}`.
- Resuming: refetches `studyProgress`, restores `currentIndex`/`answers`, and **recomputes the
  score from scratch** by re-walking all questions (guards against drift). If `completed` is
  true, jumps straight to Results.
- Each submitted answer is permanently logged to `activityLogs` (own doc, every submit —
  manual or timeout) — see §14.
- `dailyPractice/{uid}_{today}`: `attempted += 1`, `correct += isCorrect ? 1 : 0` on every
  submit.

### Navigation

- Previous (disabled on Q1); Next / "Conclude Session" (enabled only after submitting the
  current question — on the last question, shows Results and sets `studyProgress.completed =
  true`). Thin progress bar fills `(currentIndex+1)/total`. Header: "Question {n} of {m}" +
  running `Score: {correct}` (submitted-correct count, not total attempted).

### Course-outline "range" / sectioned study (notable feature)

- CourseDetail can store an "active range" in `sessionStorage` from a clicked outline bullet
  (e.g. "Questions 1–20: Hematology Basics"). Objectives text (one bullet/line) is regex-parsed
  for "Question N–M," "(N-M)," or bare "N-M" patterns to produce these clickable ranges.
- While studying inside a range, the header shows the matching outline label instead of the
  plain course title.
- On reaching the **last question of the active range** (or any detected boundary, or the end
  of the whole list), a **"Section Mastered" modal** pops instead of silently advancing:
  - ~30 colored balloons floating up for ~5s + a 5-second generated pentatonic chime (Web Audio
    API).
  - Range-specific score + "Mastery Rate" %.
  - Heading varies: **≥90% → "Outstanding Mastery!"; ≥70% → "Academic Excellence achieved!";
    else → "Excellent Progress, Scholar!"**
  - A fixed, always-identical "Scholar Motivation" quote block.
  - If a next range exists: "Next Section" (jump to its first question), "Outlines List" (back
    to CourseDetail), "Re-sync" (deletes `studyProgress` entirely + reloads — a hard restart).
  - If this was the last range: "Final Results" (Results screen, marks completed), "Outlines
    List," "Re-sync."
  - A boundary question not tied to any detected range falls back to number-containment
    matching, or defaults to the last known range.

### Results screen

`{correct} / {total}` and `{round(correct/total*100)}% Compliance`, an animated fill bar. Two
actions: **"Re-sync"** (delete the entire `studyProgress` doc + hard reload — retake from
scratch) and **"Exit"** (→ `/courses`).

### Access control

Checked (any one passes): admin flag; `payments` query for `userId + dept_name==department +
status==success`; legacy per-course doc `payments/{uid}_{courseId}`; deterministic department
doc `payments/dept_pay_{uid}_{department}`. Fails → full-screen "Access Restricted," lock icon,
Back → `/courses/:id` (paywall). Zero questions in the course → "No study content available"
empty state.

**Reads**: `courses/{id}` (one-time), `courses/{id}/content` ordered by `order` (one-time, **not**
live — avoids re-billing every open listener on every question edit), `studyProgress/{uid}_{id}`
(one-time), ad hoc `payments` (access check), `dailyPractice/{uid}_{today}` (existence check).
**Writes**: `studyProgress/{uid}_{id}` (merge or delete on Re-sync), `dailyPractice/{uid}_{today}`
(merge/increment, created fresh on first activity of the day), `users/{uid}.lastStudyDate`
(written once per calendar day only), new `activityLogs` doc per submit.

---

## 12. CourseList — browse departments/faculties & courses

**File**: `src/pages/CourseList.tsx`. The catalog browser: pick a faculty/department, then
(if paid) a level and a specific course.

### Two-level navigation

1. **Faculty/department list** (when `deptFilter === 'All'`): vertical cards (image or
   "Layers" icon, translated name, "Authorized" badge if already paid). Source = static
   `DEPARTMENTS` constant **merged with** Firestore `faculties` (admin-created, carries
   price/levels/image, can soft-delete a static department) minus admin-soft-deleted ones;
   custom faculty docs override a static one of the same name.
2. **Within a department**: a paywall screen if unpaid, or (if paid) a search box + horizontal
   level-filter pills (`100L`–`500L`, or `MB 1`–`4` for Medicine, or custom levels from the
   faculty doc) + that level's courses.

### Paywall / per-department one-time fee

- Unpaid: lock icon, "Restricted," a decorative 3-stat strip (Full Levels / ∞ Access / High
  Priority), and "Authorize Payment: ₦X / $X." Price = the matching `faculties` doc's price if
  set, else the static `DEPARTMENT_PRICES` map (**MBBS = ₦15,000/$10; all others default to
  ₦10,000/$7**, with a few extra departments like Human Nutrition and Veterinary Medicine
  carrying their own defined prices).
- Paystack checkout (kobo/cents, user's email, metadata `payment_type: department_access`,
  `dept_name`, `user_id`). Dev-only simulate bypass if no key configured (never offered in
  production).
- On Paystack success: resolves any referrer (`profile.referredByUid`, else normalizing a
  stored `referredBy` code and querying `users` by `referralCode`), then
  `POST /api/verify-departmental-payment` with the reference, department, currency, user data,
  resolved referrer ID — **the server does the actual payment write and commission crediting**
  (moved server-side specifically because client writes previously allowed self-granting free
  access — see §16/README's Security model). Success alert: "Institutional Access Granted!"
  Duplicate-purchase guard: checks the deterministic doc `dept_pay_{uid}_{department}` first and
  short-circuits with "Department access already acquired."
- "Has this department" access check reuses the same deterministic doc pattern, read live via
  a `payments` listener (`userId + status==success`), keyed by `dept_name`.

### Level filtering

- Unpaid users see a level selector containing only `'All'` plus real level names (names are
  previewable, but the whole course list stays blocked until paid, not just levels).
- Once paid, `'All'` drops and the UI auto-switches to the department's first real level.
- Search/department/level selections persist via `sessionStorage`
  (`courseList_search`/`courseList_deptFilter`/`courseList_levelFilter`), and can be pre-set
  via `?department=`/`?level=`/`?search=` (e.g. from the Dashboard search dropdown or
  department carousel).

Course cards: image/thumbnail (or book icon), level badge, title → `/courses/:id`. Fetched live
per selected department, sorted alphabetically, soft-deleted courses filtered out client-side.

**Reads**: `faculties` (live), `courses` (live, department-filtered), `payments` (live, user +
success). **Writes**: `users/{uid}.referredByUid` (client-side convenience cache before the
server call); the actual payment write happens server-side.

---

## 13. CourseDetail — single course detail screen

**File**: `src/pages/CourseDetail.tsx`. Description, paywall-gated launch controls, and the
outline/objectives list for one course.

- Back → `/courses`. Department badge (amber) + Level badge (blue), serif title, description
  blockquote (generic fallback if the admin hasn't written one).
- Decorative 3-icon trust strip: Status "Institutional," Security "Encrypted," Endowment
  "Yield" — not functional data.
- **Unpaid**: full-width "Authorize Payment: ₦X/$X" (same Paystack flow as CourseList, scoped
  to this course's department — **paying unlocks the whole department**, not just this
  course). Price from the matching `faculties` doc or `DEPARTMENT_PRICES`.
- **Paid**: a "Protocol Launch Configurations" panel:
  - **"Resume Session"** — launches at `progress.currentIndex` (or 0). Disabled/greyed
    ("Session Concluded") if progress is already `completed`.
  - **Jump-to-question field** (1 to total count) — "Jump to Qn" validates range and launches
    at that index (doesn't clear existing progress, just repositions).
  - *(A "Start Fresh"/clear-progress code path exists in the handler but isn't wired to any
    visible button — see §23.)*
- **Outline list**: parses `objectives` (one free-text bullet/line) for an embedded question
  range ("Questions 1-20," "(5-10)," bare "12-18"); matches become "Click to launch section"
  buttons (stores the range in `sessionStorage`, jumps to the range's first question);
  non-matching lines render as plain checklist items. Empty `objectives` → "Awaiting Course
  Objectives update from the Academic Board...". Clicking an outline item while unpaid
  triggers the payment flow instead of navigating.

**Access check**: the same three-tier check as StudyPage (admin bypass; deterministic
`dept_pay_{uid}_{department}`; legacy `{uid}_{courseId}`), read directly here. Course content is
only fetched **if paid**, specifically to avoid Firestore permission errors on an unauthorized
read.

**Side-effect**: loading a course writes its department/level into `sessionStorage`
(`courseList_deptFilter`/`courseList_levelFilter`) so navigating back to CourseList lands on
the right filter instead of resetting to "All."

**Reads**: `courses/{id}` (one-time), `payments/dept_pay_{uid}_{department}` + legacy
`payments/{uid}_{id}` (existence checks), `courses/{id}/content` (one-time, only if paid),
`faculties` (by name, for price), `studyProgress/{uid}_{id}` (for Resume state). **Writes**:
`studyProgress/{uid}_{id}` merge on launch; `users/{uid}.referredByUid` during payment referral
resolution; the real payment write happens server-side.

### coursesCache.ts

A per-tab in-memory cache of the whole `courses` collection, used by Dashboard's search and
"last activity" lookups. First call: one-time `getDocs` (filters soft-deleted), cached with a
timestamp. **TTL: 5 minutes** — repeat calls within that window return instantly with zero
reads; concurrent callers share one in-flight promise. Exists because the catalog changes
rarely (an admin edits it a few times a month), so an always-on live listener just for an
optional search box was wasteful.

---

## 14. ActivityLog — "Revision Center"

**File**: `src/pages/ActivityLog.tsx`. Review every question personally answered, over
roughly the last 7 days, with filters and full detail per entry. Header: "Revision Center" /
"Previous 7 Days Activity Logs." Back → `/profile`.

**Quick stat pills** (always against the full unfiltered 7-day set):
- **Correct** — `isCorrect === true && type !== 'application'`.
- **Applied** — `type === 'application'` OR no `options` array (covers legacy data).
- **Wrong** — `isCorrect === false && selectedAnswer !== null` and not application.
- **Total** — raw count.

**Filter tabs**: "All Queries" / "Correct / Applied" / "Incorrect" (wrong, answer given) /
"Skipped" (wrong, `selectedAnswer === null` — timed out). Purely client-side filtering of the
already-fetched set.

**Collapsed list item**: course title tag, type tag ("Application Question" emerald /
"Objective MCQ" blue), relative date (`MMM d, HH:MM`), 2-line question clamp, status icon
(green check = application/always "completed"; blue check = correct MCQ; gold clock = skipped;
red X = incorrect). Click to expand/collapse.

**Expanded detail**: full question text (`formatFormattedText`, "Bulk CSV Spacing Preserved"
label for application entries — implying original import via CSV). Application → "Expected
Answer & Solution Benchmark" panel (or "No expected answer recorded"). MCQ → full options list
(correct option tagged "Correct Answer," the student's wrong pick tagged "Your Choice") +
"Detailed Explanation" panel if present.

**Business rule**: the **7-day window is enforced client-side, not via a Firestore `where`**
— specifically to avoid needing a composite index. The component live-listens to **all** of
the user's `activityLogs` (filtered only by `userId` in the query) and discards anything older
than `now - 7 days` in JS. For a long-lived account, this means the entire history is pulled
over the wire on every load, filtered down after the fact — a real cost to flag in a rebuild.

**Reads only**: `activityLogs`, live, `userId`-filtered. No writes happen here — all writes
originate from StudyPage on submit.

---

## 15. Leaderboard

**File**: `src/pages/Leaderboard.tsx`. A full, filterable, department-and-time ranking of all
scholars, with a podium for the top 3.

**Controls**:
- **Time range**: "This Week" vs. "All Time."
  - This Week: `dailyPractice` where `date` is between this week's Monday and Sunday, limit
    1000.
  - All Time: `dailyPractice` ordered by `attempted` descending, limit 1000. **This is not a
    true all-time sum** — it pulls the 1000 daily-practice docs with the highest single-day
    `attempted` value, then aggregates by user from just those docs, which can under-count a
    user whose practice is spread across many smaller days. Flag this as an approximation, not
    a bug to silently "fix" without deciding the intended semantics.
- **Department pills**: "All Departments" + each entry in the static `DEPARTMENTS` list. A
  shield-check marks departments the viewer has paid for. Selecting one filters by loose
  string-match (same normalize-and-substring approach as Dashboard). Defaults to the viewer's
  own/first-paid department.
- A static, user-facing formula label is shown directly in the UI: **"Formula: (Attempts × 2)
  + (Correct × 0.5)"** — the points formula is explicit product copy, not just internal logic.

**Ranking**: same formula as Dashboard (`points = attempted*2 + correct*0.5`, 1 decimal);
Accuracy = `round(correct/attempted*100)`. Sort: points desc → accuracy desc → raw correct
desc (tie-breakers). Top 50. Names resolved the same way as Dashboard's weekly widget
(batched `/api/public-profiles` + per-id fallback); the viewer's own live profile data always
overrides any cached value for their own row.

**Display**: Top 3 → large podium cards (avatar initials, Crown/#1 gold or Medal/#2 silver /
#3 bronze, rank label "Gold/Silver/Bronze Champion/Scholar," name + university, 3-row stat
block). Ranks 4–50 → a simple divided list (rank, avatar, name + university, "{correct}
correct of {attempted} attempted," points + accuracy).

**Empty states**: "Calculating Standings..." while loading; "No Rankings Recorded Yet"
(department-specific copy if a department is selected) when empty.

**Reads only**: `payments` (one-time, defaults the filter + badges), `dailyPractice` (live,
shape depends on the time toggle), ad hoc `users/{uid}` fallback lookups. No writes.

---

## 16. Affiliate dashboard — referral program

**File**: `src/pages/AffiliateDashboard.tsx`. Lets a student who has paid for at least one
department become a referral partner: personal code/link, referral history, commissions,
payout credentials, and withdrawal requests.

### Access gate

Blocked entirely unless the user has at least one successful, non-reactivation payment tied to
a department/course (checked via `payments`: `status` success/paid, `purpose !== 'reactivation'`,
and has `dept_name`/`department`/`courseId`/`type === 'department_access'` or an ID pattern
like `dept_pay_*`/`*_course_*`). Admins, moderators, and the hardcoded super-admin email always
pass this gate regardless of actual payment history. While checking: "Authenticating Access
Authorization..." spinner. Failing: "Affiliate Platform Restricted — Course Subscription
Required" with a CTA → `/courses`.

### Joining — fully automatic

No manual sign-up button exists. On first visit, if `affiliateStatus` is unset, the client
calls `POST /api/activate-affiliate` — **activation is immediate, free, and requires no
approval step** ("Activate affiliate immediately without fee or approval," per server code).
Sets `affiliateStatus: 'active'`, `isAffiliate: true`, `isPartner: true`, a referral code
(`DS` + 6 uppercase alphanumeric, or reuse an existing one), `activatedAt`. On API failure,
falls back to the identical client-side `setDoc`. A "pending" UI state exists in the code but
nothing in the current client ever sets `affiliateStatus` to `pending` — see §23. "Synchronizing
Partner Archives..." spinner while in flight.

### Referral link/code

Code shown in a chip (e.g. `DSAB12CD`); link = `<origin>/?ref=<code>`, read-only field. "Copy"
→ clipboard (2s "COPIED!" badge). "Share" → native Web Share API when available (preset text
"Join Diamond Solution using my referral link and learn!"), else silently falls back to copy.
If no code is issued yet, a client fallback generates `DS` + first 6 chars of the uid.

### Commission rule

**Flat 25% commission** (`AFFILIATE_COMMISSION_RATE = 0.25`) on a referred student's
successful department/course payment — computed and written **server-side only**. Cross-
currency conversion uses a **hardcoded 1 USD = 1500 NGN** rate (NGN amounts floored to a whole
number; USD amounts keep decimals). Each commission is its own `affiliates` record (referrer
id/name, referred id/name, original amount/currency, computed commission amount/currency,
rate, status, timestamp). Triggers a "Commission Earned: 25% Rewards Dispatched!" email to the
referrer and a purchase-alert email to the admin noting whether the sale was referred. **A
user can never write to `affiliates` themselves** — enforced server/rules-side — preventing
self-crediting fake commissions.

### Dashboard stats (4 tiles)

1. **Referred Assets** — count of users with `referredByUid == me`.
2. **Total Earned** — lifetime sum of `commissionAmount`, regardless of withdrawals.
3. **Rev Share** — static "25%" label.
4. **Net Balance** — the actual withdrawable amount (below).

### Balance

`totalEarned` = sum of all commissions ever. `totalWithdrawn` = sum of all withdrawals NOT
`failed` (**pending withdrawals count against balance immediately**, not just completed ones).
`balance = max(0, totalEarned − totalWithdrawn)` — floored at zero. Currency follows
`profile.currency` (default NGN).

### Payout credentials

A card prompts "Initialize Credentials" (none on file) or "Update Authority" (present, shows
bank + masked account number). Modal fields depend on currency:
- **NGN**: Bank dropdown (same 11 banks/codes as Account Settings §8.2), Account Number
  (≤10 digits), Beneficiary name (auto-uppercased).
- **USD**: Payout Method (PayPal / USDT (TRC20) / International Wire — bank code hardcoded to
  `INTL`), Address/Account Details (free text), Full Name (auto-uppercased).

Saves `bankDetails: {bankName, accountNumber, accountName, bankCode}` to the profile (merge, no
server-side bank validation). Reused to pre-fill any withdrawal request.

### Withdrawal flow

"Place Withdrawal" is disabled below the minimum threshold or while another action loads.
Clicking it:
1. No bank details on file → blocks with an alert and opens the bank-details modal instead.
2. Checks balance against the **minimum withdrawal threshold: $10 USD or ₦10,000 NGN**
   (currency-dependent). Below → alerts the exact threshold and stops.
3. Otherwise opens "Select Withdrawal Amount," pre-filled with the full available balance
   (a "MAX" quick-fill exists too).

In the modal: input bounds min = 10 (USD) / 10000 (NGN), max = current balance, step = 0.01
(USD) / 1 (NGN, whole units). Submission re-validates min/max with an inline error naming the
exact limit violated. On success: writes `withdrawals/WD_{uid}_{timestamp}` —
`{userId, email, accountName (or "Unnamed Scholar"), amount, currency, bankDetails snapshot,
status: 'pending', createdAt}`. Success toast ("Withdrawal Request Dispatched!") for 2.5s, then
auto-closes.

**Withdrawals are never auto-processed** — created `pending`, requiring admin approval
elsewhere (Firestore rules: owning user may only `create` with `status: 'pending'`; only an
admin can update/delete, e.g. to mark `success`/`failed`). Status badges: green success, red
failed, blue pending/other.

### Lists

1. **Commission Archives** — every commission (referred student name, date, "Direct
   Referral," `+₦/$ amount`, "25% Rev Share"). Empty: "Awaiting Endowment."
2. **Redistributions** (withdrawal history) — amount, date, status badge. Empty: "No
   Redistributed."
3. **Network Sync** (referred users) — every `referredByUid == me` user, name + a static
   "Active"/"Verified User" badge (**reflects registration only, not whether they ever
   paid**). Empty: "Awaiting Network."

**Reads (live)**: `users` where `referredByUid == me`; `withdrawals` where `userId == me`
(newest first); `affiliates` where `referrerUid == me` (newest first); `payments` where
`userId == me` (paywall gate only); own profile (`bankDetails`/`affiliateStatus`/
`referralCode`/`currency`). **Writes**: profile merge (`bankDetails`; client-fallback
activation fields only); new `withdrawals/{id}` (create-only). Commission docs are
server-write-only.

---

## 17. PaymentHistory — receipts

**File**: `src/pages/PaymentHistory.tsx`. A simple per-user payment ledger with printable
receipts.

- Lists `payments` where `userId == me`, newest first. Each row: description, date/time,
  amount (₦/$ by `currency`), status badge.
- Description mapping: "{Department} — Department Access" for course/department payments;
  "Device Reactivation Fee" (device-block payments); "Account Reactivation Fee" (suspension
  payments); generic "Payment" otherwise.
- Status badges: green success/paid, red failed, blue other (e.g. pending).
- Clicking a row opens a **Receipt modal**: "Diamond Solution" header, Description, Amount,
  Status, Reference (falls back to doc ID), Date, a "Print / Save as PDF" button (native print
  dialog; print CSS hides everything but the receipt), close (X).
- Empty: "No payments on record yet." Loading: spinner.

Read-only — no writes happen on this screen.

---

## 18. Notifications — notification center

**File**: `src/pages/Notifications.tsx`. A central inbox for system/admin-sent messages.

- Lists `notifications` where `userId == me`, newest first, live. Each: bell icon, title,
  relative time (`formatDistanceToNow`), body (`body` field, falling back to legacy `message`),
  an "Unread Protocol" tag if unread. Unread items are blue-tinted with a solid badge; read
  ones are plain.
- **Mark as read**: clicking an unread notification sets `read: true` (click is a no-op on
  already-read items — flagged below as an accidental-dismiss risk).
- **Delete**: hover-revealed trash icon, deletes immediately — **no confirmation dialog.**
- Empty state ("Archives Synchronized"): pulsing bell, "Your institutional inbox is currently
  void of new protocols," a green "Security Status: Optimized" badge.
- Footer copy claims *"Institutional protocols are purged automatically after 30 days of
  inactivity"* — **this is informational copy only; no code anywhere performs that purge.** A
  rebuild implementing this literally would need a scheduled backend job that doesn't currently
  exist.

**Reads**: `notifications`, user-filtered, live. **Writes**: `{read: true}` update; delete by
ID. Notifications themselves are created elsewhere (admin broadcast, or server-side on
affiliate/payment events) — this page only consumes/manages them.

---

## 19. Chat — student support chat

**File**: `src/pages/Chat.tsx`. A real-time, one-on-one support channel between the student and
"the admin board" — one private thread per user.

- Thread path: `chats/{uid}` (parent) + `chats/{uid}/messages` (subcollection). Loads the
  **latest 50 messages** only, oldest-to-newest, live, auto-scrolls to bottom on new arrivals —
  **no pagination/"load more" to see further back.**
- Message bubble: text + `hh:mm a` timestamp. Admin messages: left, light-blue, labeled
  "Admin." Student's own: right, solid blue, unlabeled.
- **Sending**: clears the input immediately (optimistic); upserts the parent doc
  (`lastMessageAt`, `userId`, `userName` or "Scholar" fallback, `adminUnreadCount` incremented
  by 1); adds the message doc (`senderId`, `text`, `createdAt`); fires a **best-effort** WhatsApp
  alert to the admin (`POST /api/whatsapp/notify-admin`, authenticated) — failure is only
  console-logged and never blocks or surfaces an error to the student, so sending always
  "succeeds" from the student's view even if the admin isn't externally alerted.
- Opening the chat with messages present resets the student's own `unreadCount` to 0 — note
  this is tied to **message data arriving**, not strictly to a "chat opened"/focus event.
- Empty state: Diamond logo icon, "Channel Established"/"Queries Sync."
- Header: pulsing green dot + "Board Online" (**static — never reflects actual admin
  presence**) + a small "Security" badge.
- Send is disabled on empty/whitespace-only input. **No message editing/deletion, no read
  receipts, no file/image attachments — text only.**
- Rules: a user can only read/write their own `chats/{uid}` thread; admins can read/write any.

**Reads**: `chats/{uid}/messages` (ordered `createdAt asc`, limit 50, live). **Writes**:
`chats/{uid}` merge (`unreadCount: 0` on view, or `lastMessageAt`/`userId`/`userName`/
`adminUnreadCount: increment(1)` on send); new message doc. **External**:
`POST /api/whatsapp/notify-admin` (best-effort, Firebase-ID-token authenticated).

---

## 20. Admin back office

**File**: `src/pages/AdminDashboard.tsx` (5,194 lines — single file powers every tab), plus
`src/components/MediaManager.tsx`, `src/components/WhatsAppDirectoryManager.tsx`,
`src/components/ImageUploader.tsx`.

### 20.0 Shell / navigation

Single-page app: fixed left sidebar (collapsible, 240px) + main content area; **not**
route-based — one `tab` state swaps the rendered component with a fade/slide transition. Full
15-tab list, grouped exactly as the sidebar shows:

- **Main**: Dashboard, (a link-out to "User Dashboard" → `/dashboard`, not an admin tab),
  Users, WhatsApp Numbers, Affiliates (badge = pending commission count), Withdrawals (badge =
  pending withdrawal count)
- **Finance**: Payments, Analytics
- **Content**: Departments, Questions, Pictures & Media, Notifications, Quotes, Support
  (badge = total unread support messages across all threads), System Logs, Settings

Header: hamburger sidebar toggle + active-tab title. Admin identity: avatar shows the first
letter of the signed-in email, "Super Admin" label. Logout clears the `SessionService` record
for the uid, then `auth.signOut()`.

### 20.1 Lock screen (gate in front of the entire dashboard)

Independent of Firebase Auth — a **local PIN gate** re-checked every mount:
- Checks `users/{uid}.adminPasscode`. No passcode → first-time setup: create a 6-digit PIN
  (entered twice), saved **in plaintext** to `adminPasscode`. Button: "Initialize Enclave."
- Subsequent visits: enter the 6-digit PIN via an on-screen keypad (auto-submits at 6 digits).
  Wrong PIN → "INVALID PASSCODE: Access Denied," clears input.
- **Biometric unlock**: if WebAuthn is supported, a fingerprint button unlocks via
  `authenticateBiometrics()` instead of the PIN.
- This gate resets on every mount (every page load/navigation into `/admin`) — it never logs
  the admin out of Firebase, it only hides the UI.

### 20.2 Security Clearance ("OTP") protocol — reused across tabs

A two-step email-OTP gate wrapping sensitive mutations:
`requestClearance(id, actionType, executeCallback)`, `actionType` ∈
`'delete' | 'update' | 'payout' | 'withdraw'` (Departments tab keeps its **own duplicated
copy** that also supports `'update_levels'` — i.e. there are at least two independent OTP
implementations coexisting in the real app).

Flow: generate a random 6-digit token → write `admin_tokens/{action}_{sanitizedId}`
`{token, expiresAt: now+10min, targetId, action, adminEmail: 'peteradekunle923@gmail.com'}`
(**the OTP recipient is a hardcoded address, not the currently logged-in admin's own email**)
→ `POST /api/send-otp` to email it (API failure or `emailSent:false` reveals the OTP in a
plaintext "[DEVELOPMENT MODE]" alert) → modal "Security Clearance Required" (6-digit input,
Abort / "Authorize Protocol") → on submit, re-reads the token doc, checks match + not expired
→ runs the callback → deletes the token doc. Invalid/expired → "SECURITY ALERT: Invalid or
expired token."

**Gated by this flow**: Users tab (suspend/unsuspend, change role, permanently delete a user);
Affiliates tab (authorize a commission payout); Withdrawals tab (approve a payout);
Departments tab (edit faculty, delete a faculty, update levels); Questions tab (delete a course
archive; permanently delete a single question).

**Not gated**: approving/activating affiliate partner status; broadcasting notifications;
posting quotes; moving questions/courses to soft-delete trash (only *permanent* purge is
OTP-gated in some paths); bulk-deleting all questions in a course (instead gated by typing the
literal phrase "DELETE ALL"); replying to support chats; editing Settings/social links;
uploading pictures.

### 20.3 Dashboard tab

Landing tab. **7 StatCards**, refreshed every **60 seconds via `setInterval`** (not live
listeners — deliberately, to avoid full-collection reads):
1. Total Students (`users` count; sub-label = suspended count).
2. "Protocol Violation" — total suspended count.
3. Total Revenue — sum of `payments.amount` where `status=='success'`, NGN/USD summed
   separately, displayed concatenated (e.g. "₦120k + $45").
4. Total Paid Out — same NGN/USD split-display, from `withdrawals` where `status=='success'`.
5. Pending Affiliates — `affiliates` where `status=='pending'`.
6. Pending Payouts — `withdrawals` where `status=='pending'`.
7. Support Queries — sum of `chats.adminUnreadCount` across all threads.

**Recent Payments table** (one-time `getDocs` on mount): top 5 most recent, columns Payer,
Department, Amount, Status; "View Ledger →" → Payments tab.

**Revenue Breakdown panel**: successful payments aggregated by `dept_name` (enrolled count +
summed amount), sorted descending, top 6 as horizontal progress bars (width ∝ max department
revenue, 6-color rotating palette), each row showing dept name, enrolled count, ₦ millions (2
decimals).

### 20.4 Users tab

**Data**: one-time `getDocs(users)` on mount — explicitly **not** a live listener (a comment
notes this was previously a read-amplification bug: every write anywhere re-delivered the
entire `users` collection to every open admin tab). Faculties load live (small, bounded).

**Search/filter**: free text across displayName/email/suspensionReason; status dropdown
(All / Authorized Only (`emailVerified`) / Pending Only / Suspended-Protocol-Violation).

**Export**: CSV `scholars_directory_export` — WhatsApp Number, Full Name, Username,
University, Department, Email, Role, Status. "WhatsApp Numbers" button jumps to the dedicated
tab (§20.5).

**Per-row columns/actions**:
- Profile (avatar initial, name, @username, email, WhatsApp in green if present).
- Last Active (`lastStudyDate`, "Never" fallback).
- Dept + university, with an inline pencil icon opening a `prompt()` dialog to directly
  overwrite `institutionalName`/`university` (no OTP).
- Affiliate Status badge + referral code.
- **Role** — inline select (student/moderator/admin): `window.confirm()` → OTP clearance →
  updates `users/{id}.role`; promoting to admin also writes `admins/{uid}`; demoting from
  admin deletes that doc. The admin's own row has the role select disabled.
- Status — Suspended (red) or "Protocol Active" (green, pulsing dot), plus suspension reason
  + currency preference.
- **"Approve Partner"** (shown only if not already a partner) — **not OTP-gated.** Directly
  sets `affiliateStatus:'active'`, `isAffiliate:true`, `isPartner:true`, generates a referral
  code (`DS` + 6 random chars), stamps `activatedAt`.
- **Suspend/Unsuspend** toggle — OTP-gated; sets `status`, `suspensionReason` (default
  "Suspended by Administrator"), `suspendedAt`.
- **Delete** — disabled on the admin's own account; `window.confirm()` → OTP → calls backend
  `POST /api/admin/delete-user` (Bearer token) so the real Auth + Firestore deletion happens
  server-side (client SDKs can't delete another user's Auth account).

**Add User modal**: Full Name, Email, Password, Institutional Role, Department Access
(optional). Implementation detail worth preserving in a rebuild: the new user is created via a
**secondary Firebase App instance** (so creating it doesn't replace/log-out the admin's own
session); the new `users/{uid}` doc is written with the secondary app's client (role forced to
`student` at creation, to satisfy security rules), then, if a non-student role was chosen, the
role is updated via the *primary* (admin) connection, and an `admins/{uid}` doc is created for
admin role. The secondary app's auth session is signed out and the instance destroyed in a
`finally` block. Specific friendly errors for `auth/email-already-in-use`,
`auth/weak-password`, `auth/invalid-email`.

### 20.5 WhatsApp Numbers tab (`WhatsAppDirectoryManager.tsx`)

A dedicated contact-extraction tool pulling WhatsApp/phone numbers for broadcast/outreach.

- One-time `getDocs(users)`, filtered to non-empty `whatsapp`/`whatsappNumber`/`phone`/
  `phoneNumber`. Numbers are kept **exactly as typed at registration** — no reformatting
  (deliberate).
- Header stats: total WhatsApp Contacts, Unique Numbers (de-duplicated via a `Set`).
- Search by number, username, name, department, or university.
- **"Copy All WhatsApp Numbers"** — copies every filtered number as one comma-separated
  clipboard string ("All Copied!" for 2.5s).
- **"Download (CSV)"** — `users_whatsapp_numbers_<date>` with WhatsApp Number, Full Name,
  Username, University, Department.
- Per-row: **Copy** (single number, 2s confirmation) and **Chat** (opens
  `https://wa.me/<digits-only>` in a new tab — a direct deep-link into WhatsApp).

### 20.6 Affiliates tab

Two sub-tabs (pill toggle, not separate routes): **Commissions (Matrix)** and **Partner
Registry**.

**Data**: one-time `getDocs` for `affiliates`/`withdrawals`; a **live** `onSnapshot` on `users`
filtered `isPartner==true` (small bounded set, intentionally live).

**Export**: raw CSV dump of whichever sub-tab's dataset is active (`affiliate_commissions` /
`affiliate_registry`).

- **Commissions**: Referrer, Commission Amount, Status (pending/paid), Actions. **"Authorize
  Payment"** — disabled once paid; OTP-gated (`'payout'`); sets `status: 'paid'`, `paidAt`.
- **Partner Registry**: Name/email, Referral Code, Total Earned (sum of their `affiliates`
  commissions), Total Paid (sum of their non-failed `withdrawals`), Balance (`max(0, earned -
  paid)`). **Read-only** — no action buttons.

### 20.7 Withdrawals tab

**Data**: one-time `getDocs` ordered by `createdAt desc`. Columns: Affiliate, Bank Details,
Amount, Status, Actions.

**"Approve payout"** (only when `status=='pending'`) — OTP-gated (`'withdraw'`). On
confirmation: gets the admin's ID token, `POST /api/payout` (amount, bank account
number/code/name, reference `WD_{id}_{timestamp}`, userId, `hasPaidCourse:true`, currency). On
success: updates the withdrawal to `status:'success'`, stores `processedAt` + the raw
`paystackResponse`; an `isManual` response flag (likely for currencies Paystack can't
auto-disburse) alerts the admin to wire funds manually. On failure: `status:'failed'` with the
error, `processedAt`, and an alert. Since the list is a one-time load, the UI patches local
state directly after success/failure rather than waiting on a snapshot. Already-processed rows
show `processedAt` instead of the action button.

### 20.8 Payments tab

Read-only financial ledger. One-time `getDocs`, sorted desc. Filters: free text (reference,
studentName, email, department); gateway dropdown — "Paystack Secure" (reference prefixes
`pay_`/`sim_`/`dept_pay_`) or "Flutterwave Flow" (`flw_`) — the only way the two gateways are
distinguished, since there's no explicit gateway field. Export → raw CSV `financial_ledger`.
Columns: Ref, Payer, Amount, Status, Timestamp (`yyyy.MM.dd | HH:mm`). **No edit/delete/refund
actions anywhere on this tab.**

### 20.9 Analytics tab

**Top-level KPIs** (4 StatCards from the Dashboard tab's shared aggregation): Live Revenue
(all-time), Scholarly Access (total students), Paid Enrollments, Suspension Rate (%).

**Revenue/Payout History bar charts** (12-month bars, current calendar year): one-time
`getDocs`, bucketed by month, **USD converted to NGN at a hardcoded ₦1,500 rate**, bar heights
normalized to the tallest month.

**Engagement Analytics** (sub-section of this same tab): one-time fetch + manual refresh, per a
comment explicitly citing a prior leaderboard read-amplification bug as the reason.
- Period selector (7d/30d/90d) + "Refresh" button; "Snapshot as of {time} — not live."
- **Most Active Scholars** (top 10): `dailyPractice` where `date >= cutoff`, ordered desc,
  capped at 1000, aggregated per `userId`, top 10 by attempted count. Names resolved via
  batched `/api/public-profiles`. Columns: Rank, Scholar, Department, Attempted, Accuracy %,
  Study Time.
- **Visit Frequency / Peak Hours**: `login_events` where `dateKey >= cutoff`, ordered desc,
  capped at 1000. Three StatCards (Total Visits, Unique Visitors, Avg Visits/Visitor); a daily
  "Page Visits Over Time" bar chart; a 24-bucket "Peak Visit Hours (local time)" bar chart.

### 20.10 Departments tab

**Data model**: merges a hardcoded `DEPARTMENTS`/`DEPARTMENT_STRUCTURE`/`DEPARTMENT_PRICES`
constants file with Firestore `faculties` (admin overrides/additions). A static department is
soft-deleted via `faculties/{deptName}.isDeleted:true` (a hardcoded constant can't be truly
deleted); a custom (non-static) faculty can be hard-deleted outright.

**Columns**: Picture & Name (hover camera icon → quick image swap, `compressImage`, no OTP),
System Slug, Tuition Base (₦ and $), Operational Mode ("Default Institutional" vs "Admin
Customized"), Actions.

**Row actions**: **Archives** link → Questions tab pre-filtered to that department;
**Edit Details** (OTP-gated); **Levels** icon (opens the Manage Levels modal — opening isn't
OTP-gated, *saving* is); **Delete** (OTP-gated; soft-delete static / hard-delete custom).

**"+ Add Faculty"** modal: image uploader, Faculty Name (required), Tuition Fee in ₦ and $
separately entered (**not auto-converted from one another**), a checkbox grid of standard
levels (200L/300L/400L/500L/600L/Application Questions) + a free-text "Manual Level Input"
appended to the selection.

**Manage Levels modal**: inline rename/remove per level, "Add New Level" input. **"Save Levels
(Requires OTP)"** — explicitly labeled; `'update_levels'` clearance; writes the new array
(`setDoc merge` the first time a static dept is customized, `updateDoc` after).

*Note*: this tab's OTP modal/state is a **fully separate, duplicated implementation** from the
top-level one in `AdminDashboard` — i.e. at least two independent OTP flows coexist in the real
app; a rebuild should collapse this into one shared mechanism.

### 20.11 Questions tab (course/question content management — the most complex tool)

**Toolbar**: department filter, course/series search, "+" → "Archive Provisioning" (Add
Course) modal.

**Course chip row**: horizontal pills `{title} ({level})` per course matching the current
filter/search/trash-state. Hover-reveal actions: normal mode → "X" moves to Trash
(`isDeleted:true`); trash mode → checkmark restores inline, trash icon opens permanent-delete
confirmation.

**Trash toggle** flips the whole tab between active and trashed views:
- "Restore All (N)" bulk-restores every trashed question in the active course (batched writes,
  ≤400 ops/batch).
- Course-level "Restore All" bulk-restores every trashed course platform-wide.
- **"Restore Default Archives"**: walks the entire hardcoded
  `DEPARTMENT_STRUCTURE.coursesByLevel` tree and, for every defined course-title/level/dept
  combo, either un-deletes it (if soft-deleted) or creates it fresh (if missing) — effectively
  a "factory reset / repair the default catalog" button, reporting created-vs-restored counts.

**Active course panel**: picture (hover-swap), Title/Department/Level/Question-Type badges.
- **Edit Details** — title/department/level/question-type/description/picture (not OTP-gated
  for courses, unlike Departments).
- **Bulk Delete (N)** (only when not in trash, questions exist) — requires typing the literal
  phrase **"DELETE ALL"** to enable the button; deletes every question individually
  (`Promise.all`).
- **Download Template** — a CSV template (objective:
  `Question, Option A-E, Correct Answer (A-E or 0-4), Explanation`; application: `Question,
  Expected Answer`).
- **Import Archive** (`.csv` only) — hand-rolled RFC4180-ish parser (supports quoted multi-line
  cells), skips the header row, batches writes (commits every 450 ops, respecting the 500-op
  Firestore batch limit), auto-assigns sequential `order` continuing from the current count,
  accepts the Correct Answer column as either a letter A-E or an index 0-4.
- **Course Content** — free-text "Academic Objectives" (one per line), stored on the course's
  `objectives` field (the same field CourseDetail/StudyPage parse for outline ranges).
- **Export Archive** — same column layout as the template, with `formatFormattedText` cleanup.
- **+ Add New Question** → the Query Entry Terminal modal.

**Question list** (searchable across text/options/explanation/expected-answer): index,
question text, then either an "Expected Answer" block (application) or a 2-column grid of up
to 5 lettered options with the correct one highlighted green + explanation (objective). Per-
question: Edit/Delete (normal) or Restore/permanent-Delete (trash). Deleting outside trash
soft-deletes; deleting inside trash is permanent. Permanent course/question deletion is
OTP-gated when `requestClearance` is supplied.

**Add/Edit Question modal ("Query Entry Terminal")**: Question Type selector (independent per
question, can differ from the course's default). **"Auto-Translate to French"** calls
`/api/translate` three times in parallel (question, options array, explanation). Examination
Query (required). Application → single "Expected Answer" textarea (required). Objective → 5
option inputs (A–E), click a letter-tile to mark correct (green), + optional "Rational
Explanation." Submit creates (`addDoc`, auto `order` = count+1) or updates
(`updateDoc`) under `courses/{courseId}/content`.

**Add Course modal**: picture, Title, Department (changing it resets Level to that department's
first level), Level (options from the selected department's level list), Question Type
(Objectives/Application). Creates with `price:0`, a default Unsplash thumbnail fallback.

**Edit Course modal**: same fields + Description; updates and syncs `activeCourse` state
immediately.

**Shared delete-confirmation modal** (course or question): copy differs by trash state —
"Move to Trash Bin" (reversible, normal view) vs. "Confirm Destruction" (permanent, trash
view). When `requestClearance` is passed, the delete runs through OTP; otherwise it calls the
plain soft/hard delete directly.

### 20.12 Pictures & Media tab (`MediaManager.tsx`)

A unified visual-asset manager for every Department card picture and every Course card
picture, with live before/after preview — so admins don't have to dig through the Departments
or Questions tabs just to swap an image.

Two sub-tabs: **Departments ({count})** / **Courses ({count})**. Search filters by
name/title/department/level (Courses sub-tab also has a department dropdown). Success toast:
"Picture updated for {name}!" (3.5s).

- **Departments sub-tab**: card grid (static defaults merged with custom `faculties`, same
  merge as §20.10), each showing department tag, name, price line, a "✓ Live Picture Set" / "•
  No Picture" badge, and a **live mock preview** of exactly how the card renders on the student
  dashboard. `ImageUploader` saves via `updateDoc` (existing custom doc) or
  `setDoc(..., {merge:true})` keyed by department name (upgrades a static default into a real
  custom doc on first image set).
- **Courses sub-tab**: card grid of non-deleted courses, department/level tags, "✓
  Custom"/"Default" badge, a live mock course-card preview, `ImageUploader` immediately
  updating both `imageUrl` and `thumbnail` on save.

Both sub-tabs show a per-item saving spinner and an empty state when search/filter yields
nothing.

### 20.13 Notifications tab

**Compose**: Title + Message (both required). "Broadcast Secure Protocol" creates a
`notifications` doc `{title, message, read:false, createdAt}`. **No per-user targeting,
scheduling, or read-tracking UI** — a single global broadcast list. Confirms via alert.

**History** (live, `createdAt desc`): title, send date, 3-line message preview, "SENT BY:
SUPER ADMIN" label, **"Revoke Log"** delete button (`window.confirm` → `deleteDoc`). Empty:
"Clear communication log."

### 20.14 Quotes tab

**Compose**: quote text + Author (optional, defaults to "Diamond Intelligence"). "Authenticate
& Publish" adds a `quotes` doc `{text, author, createdAt}`.

**List** (live, `createdAt desc`): pull-quote cards with author + date-on-hover; trash icon
deletes **directly, no confirmation, no OTP**. Empty: "Platform awaits initial wisdom."

### 20.15 Support tab

**Data**: one-time `getDocs` for `users`/`chats` (thread list is **not** live — must
leave/re-enter the tab to refresh); the currently-open conversation's messages **are** live.

**Thread list** (left panel): one row per `chats` doc, cross-referenced to the matching user
doc for name/department (fallback generated name "Scholar [abc12]" / "Unknown Origin" if no
match), sorted by unread count descending; red badge if `adminUnreadCount > 0`.

**Conversation view** (right panel, full width when a thread is open): header shows the
scholar's name + an "Active Archives" pulsing-dot; "Back to Threads." Bubbles: admin
right-aligned/blue, user left-aligned/light, `hh:mm a` timestamps.

- Opening a thread auto-marks it read (`adminUnreadCount:0` merge).
- Reply box: text + send; submitting adds a message (`senderId:'admin'`) to
  `chats/{id}/messages`, increments the **user's** `unreadCount` and sets `lastMessageAt`.

No ticket status, no canned responses, no attachments — purely a two-pane live chat.

### 20.16 System Logs tab

Read-only security/audit trail. Live `onSnapshot` on `system_logs`, `createdAt desc`, capped
at **100 most-recent entries**. Search across email/purpose/reason. Columns: Timestamp (`MMM d,
HH:mm:ss`), Scholar Email + UID, Event Type (badge — red if `purpose` contains "Protocol", else
blue), Data/Reason — either a red "reason" string (failure case) or **the raw OTP code itself
in large blue monospace text** (a notable security-sensitive detail: issued OTP codes are
displayed in this admin log view). Empty: "No institutional security logs discovered...". No
actions, no export.

### 20.17 Settings tab

**Data**: live `onSnapshot` on the single doc `settings/institutional_links`.

**Form fields** (all optional, simple text/email): Telegram Handle, WhatsApp Interface,
Support Email Archive, Twitter (X) Command, Facebook Network, Instagram Feed.

**Save**: "EXECUTE PROTOCOL UPDATE" — a `setDoc` of `{...formData, type:'social', updatedAt}`
(this is a **full overwrite**, not a partial merge). A static red warning banner reminds the
admin these links are visible to all authenticated scholars.

**This is the only settings surface in the whole admin back office** — no tab for
payment-gateway keys, global pricing (lives per-department in the Departments tab), feature
flags, or admin-user management beyond the Users tab's role dropdown.

### 20.18 Shared/cross-cutting admin components

- **`ImageUploader.tsx`** (reused in Departments/Courses/Media Manager): drag-and-drop or
  click-to-browse (PNG/JPEG/WebP/GIF/SVG); compresses via `compressImage(file, 480, 480,
  0.78)` and returns a base64 data URI — **images are stored as inline base64 strings directly
  on Firestore documents, never uploaded to a separate storage bucket/CDN.** An alternative "Or
  Web URL" mode stores an external URL as-is (no compression). Shows hover-revealed
  Replace/Delete once an image is set; broken URLs just disappear (no fallback icon).
- **CSV**: a generic `downloadCSV(data, filename)` used for most exports (Users, Affiliates,
  Payments, WhatsApp numbers); the Questions tab has its own richer hand-built CSV
  export/import/template logic (multi-line quoted cells, two schemas by question type).
- **Currency**: NGN/USD kept as separate running totals almost everywhere and displayed
  concatenated rather than converted; the Analytics tab's historical charts are the one place a
  hardcoded **1 USD = ₦1,500** conversion combines them into single bars.

### 20.19 Admin-specific architectural facts worth preserving

1. Almost every list-heavy tab (Users, Payments, Affiliates, Withdrawals, Support's thread
   list, WhatsApp directory) deliberately uses **one-time `getDocs`, not `onSnapshot`**, to
   avoid full-collection read amplification — a documented prior-incident fix (see README's
   Operational notes). A rebuild should replicate this "fetch once, manual/periodic refresh"
   pattern for anything of this shape rather than defaulting to live listeners.
2. Small/bounded collections (faculties, notifications, quotes, the settings doc, the
   currently-open support conversation, `system_logs` capped at 100, the `isPartner`-filtered
   users) stay live.
3. Dashboard-level stats use Firestore aggregation queries (`getCountFromServer`,
   `getAggregateFromServer` + `sum()`) refreshed on a 60s interval — cheap regardless of
   collection size.
4. The OTP protocol recurs across Users/Affiliates/Withdrawals/Departments/Questions, always
   emailing the same hardcoded address (`peteradekunle923@gmail.com`), never the logged-in
   admin's own.
5. Soft-delete/Trash exists specifically for Courses and Questions, but **not** for Users,
   Payments, Affiliates, Notifications, or Quotes (those are hard-deleted immediately, or never
   deletable from this UI at all).
6. Pictures are base64 strings embedded in Firestore documents — there is no Storage-bucket
   image pipeline anywhere in the admin tools.

---

## 21. Shared infrastructure

### 21.1 Internationalization — `src/context/LanguageContext.tsx`

**Exactly two languages**: English (`en`) / French (`fr`) — a strict union type, no mechanism
to add a third without editing this file (no JSON loading, no ICU/pluralization).

- `LanguageProvider` wraps the app, exposes `{language, setLanguage, t}` via `useLanguage()`.
- `setLanguage()` updates state and immediately persists to `localStorage['app-language']`.
- Initializes from that key on load, defaulting to `'en'`. **No browser/OS locale
  auto-detection** (`navigator.language` is never read).
- `t('some.key')` does a flat dictionary lookup, falling back to the raw key if missing — with
  one special case: untranslated `dept.*` keys strip the `dept.` prefix and return the raw
  department name rather than the literal key.
- No cross-tab sync — persistence is for reload/future sessions only, not live multi-tab
  propagation.
- **~200+ keys per language**, covering virtually every surface: splash/auth/OTP, navigation,
  dashboard, course/faculty browsing, quiz/study flow, course detail, profile, the full
  affiliate dashboard, chat, the entire admin dashboard (users, WhatsApp directory,
  departments, questions, notifications, quotes, support, broadcast, revenue analytics),
  generic UI strings, payments, access-restriction messaging, greetings, stats labels, and a
  dedicated `dept.*` department-name map.
- A **separate, server-side AI translation** exists: `POST /api/translate` (Gemini
  `gemini-3.5-flash`) translates arbitrary text/arrays on request — used only for the admin's
  "Auto-Translate to French" question-authoring button, not for static UI strings. Falls back
  to returning the original text unchanged if `GEMINI_API_KEY` isn't configured.

### 21.2 Shared app shell — `src/components/Layout.tsx`

Every page is wrapped in `<Layout>`:

- **Sticky top bar**: Diamond logo (icon-only) → `/dashboard`, a divider, a dynamic page title
  (looked up from a small route→label map — `/dashboard`→"Dashboard", `/courses`→"Departments",
  `/leaderboard`→"Rank", `/affiliate`→"Affiliates", `/chat`→"Chats", `/profile`→"User",
  `/admin`→"Admin"; unmapped routes fall back to "Departments"). Right side: a chat shortcut
  (gold unread badge) and a profile shortcut.
- **Floating bottom nav** (rounded, dark navy, present on every page): Home → `/dashboard`;
  Study (labeled "Departments") → `/courses`; Chat → `/chat` (same unread badge); Profile →
  `/profile`; **Admin (Shield) → `/admin` — conditionally rendered only when `isAdmin`.** Active
  tab: filled blue pill + bold white text; inactive: muted slate.
- **Persistent unread-chat indicator**: Layout holds a live `onSnapshot` on `chats/{uid}`
  reflecting `unreadCount` as a gold badge on both the header chat icon and the bottom-nav chat
  tab — a cross-page, always-live indicator.
- Page structure: full-height flex column, light gray-blue background (`#F8F9FB`), bottom
  padding to clear the floating nav, centered `max-w-7xl` content area.
- **No language switcher lives inside Layout** — only Splash/Login expose the EN/FR toggle.

### 21.3 `src/components/DiamondLogo.tsx`

The app logo: a hand-drawn SVG (graduation cap + tassel + interlocking "D/S" monogram),
configurable size (`xs`–`xl` or numeric), layout (`vertical`/`horizontal`/`icon`-only), color
variant (blue/white/gold/custom), and optional tagline text ("Committed to raising first-class
professionals."). No other functional role.

### 21.4 `src/lib/firebaseUtils.ts` — shared error handling

- `handleFirestoreError(error, operationType, path)`: logs a structured diagnostic (op type,
  path, current auth user's uid/email/verification/anonymous/tenant/provider) as a warning,
  then conditionally re-throws. **Swallows** quota-related errors (`resource-exhausted`,
  "quota") and errors during `LIST` operations specifically — logged but not thrown, so a
  transient quota blip doesn't crash a live listener. Everything else re-throws (JSON-
  stringified) so calling code can surface it.
- `safeOnSnapshot(queryOrRef, onNext, onError)`: wraps `onSnapshot`, guards against updates
  firing post-unsubscribe, and on error (especially quota exhaustion) **automatically falls
  back to a one-time `getDocs`/`getDoc`** so the UI still gets data even when the live listener
  fails.

Net effect: the app is resilient to Firestore quota/resource-exhaustion errors everywhere —
listeners degrade to one-shot fetches rather than crashing, and every Firestore error carries
rich auth-context diagnostics.

### 21.5 `src/lib/csvUtils.ts`

A single `downloadCSV(data, filename)` used app-wide (admin exports): derives headers from the
first row's keys, quote-escapes values, CRLF-joins, prepends a UTF-8 BOM (correct Excel/
Numbers/Sheets Unicode handling), downloads via a Blob/object URL and a programmatic
`<a download>` click. **Export only** — no CSV parsing/import logic lives here (the Questions
tab's bulk import has its own separate hand-rolled parser, §20.11).

### 21.6 `src/lib/imageUtils.ts`

`compressImage(file, maxWidth=400, maxHeight=400, quality=0.75)`: resizes via canvas
(aspect-preserving, capped at 400×400 by default — Departments/Courses/MediaManager instead
call it with 480×480/0.78, see §20.18), fills transparent backgrounds white, encodes as a
WebP data URL (JPEG fallback) — explicitly kept small (**<50KB target**) because images are
stored inline as base64 in Firestore, which has document size limits. SVGs under 100KB pass
through untouched. `isValidImageUrl(url)` checks for a usable data: or http(s): reference.

### 21.7 `src/lib/utils.ts`

- `cn(...)` — the standard `clsx` + `tailwind-merge` combiner used throughout.
- `formatFormattedText(val)` — normalizes freeform text from CSV imports or stored records:
  converts literal `<br>` tags and escaped `\n`/`\r\n` to real newlines, normalizes Windows/Mac
  line endings to Unix `\n`, trims only outer whitespace while preserving internal formatting.

### 21.8 Third-party services/SDKs

| Dependency | Purpose |
|---|---|
| `firebase` + `firebase-admin` | Firestore, Firebase Auth, real-time listeners (client); privileged server-side operations (token verification, admin writes). |
| `react-paystack` + direct Paystack REST (`axios`) | NGN payment processing for course/department unlock and reactivation fees, and affiliate payout via Paystack's Transfer/Transfer Recipient APIs. Every transaction is independently re-verified server-side via `transaction/verify/{reference}` before anything is granted — the client never self-reports success. |
| `@getbrevo/brevo` (Brevo/Sendinblue) | Transactional email — OTP codes, verification emails, admin/referrer notification emails. Includes sender auto-discovery and Brevo IP-whitelisting error handling. |
| `resend` | A second email SDK present as a dependency, but the primary email paths in `server-app.ts` route through Brevo — appears to be a fallback/partially-migrated-away-from provider. |
| `@google/genai` (Gemini) | `POST /api/translate` — `gemini-3.5-flash`, used only for the admin's "Auto-Translate to French" question-authoring feature; falls back to passthrough if unconfigured. |
| WhatsApp (Meta Cloud API via raw `axios`, no SDK) | `POST /api/whatsapp/notify-admin` (chat → WhatsApp alert); `GET/POST /api/whatsapp/webhook` (Meta verification + incoming admin replies routed back into the right user's chat doc). |
| `jsonwebtoken` | Server-side signing/verification of custom JWTs (distinct from Firebase ID tokens) — e.g. the OTP-verify short-lived token consumed by `/api/complete-device-reactivation`. |
| `express` + `express-rate-limit` + `serverless-http` | The backend API framework — rate-limited Express, deployable long-running or wrapped serverless. |
| `recharts` | Admin analytics charts. |
| `motion` | Animation (page transitions, StudyPage balloons, etc.). |
| `date-fns` | Date formatting/manipulation. |
| `zod` | Server-side request validation (e.g. `/api/public-profiles`). |
| `lucide-react` | Icon set throughout. |

**Key architectural note**: payment and payout flows are deliberately server-authoritative —
the client never self-reports a successful payment; the server independently re-verifies every
Paystack reference before unlocking content or granting balance. See README's
[Payment & access model](./README.md#payment--access-model) for the full write-path detail.

---

## 22. Cross-cutting business rules — cheat sheet

Every exact number that appears anywhere in this app, in one place:

| Rule | Value |
|---|---|
| Points formula | `attempted × 2 + correct × 0.5` (1 decimal) |
| Accuracy | `round(correct / attempted × 100)` |
| Daily practice quota (recommended, not enforced) | 50 questions/day |
| Per-question timer — objective/MCQ | 60 seconds |
| Per-question timer — application | 120 seconds |
| Study-duration sync interval | ~every 2 minutes (checked every 30s) |
| Progress debounce (non-critical saves) | 10 seconds |
| Idle auto-logout | 30 minutes |
| Device registration cap | 2 devices per account |
| Device-block lockout | 24 hours (hard, non-skippable even with payment ready) |
| Device-block reactivation fee | ₦1,000 flat (no USD alternative) |
| Suspension reactivation fee | ₦1,000 (Nigeria/unset) or $2 (other) |
| USD→NGN fixed conversion (reactivation, analytics charts) | $1 = ₦1,500 |
| Affiliate commission rate | 25% flat |
| Affiliate commission currency conversion | $1 = ₦1,500 (same fixed rate) |
| Minimum withdrawal | $10 USD or ₦10,000 NGN |
| Default department price | ₦10,000 / $7 |
| MBBS department price | ₦15,000 / $10 |
| Registration password | ≥8 chars, upper+lower+digit+special |
| Account-settings password change | ≥6 chars only (weaker — inconsistency to resolve) |
| OTP token validity | 10 minutes (admin clearance tokens) |
| Image compression target | <50KB, resized to 400×400 (480×480 for dept/course pictures) |
| Chat history loaded | latest 50 messages, no pagination |
| Activity Log window | last 7 days (client-side filtered) |
| System Logs cap | latest 100 entries |
| Course cache TTL | 5 minutes |
| Onboarding tour | 5 slides, auto-advance every 6 seconds, re-shows every fresh login |
| Hardcoded super-admin email | `peteradekunle923@gmail.com` |
| OTP recipient for all admin security-clearance actions | `peteradekunle923@gmail.com` (hardcoded, not the acting admin) |

---

## 23. Known issues / deliberate decisions for a rebuild

Things the current app does that a rebuild should decide about on purpose, rather than
silently copy or silently "fix":

- **Dead/unreachable code paths in Login.tsx**: a fully-built inline OTP-verification step for
  *registration* (`showOtpStep` + `otpAction === 'register'`) is never triggered by the actual
  registration flow, which signs the user out and sends them to Sign-In instead. Likewise,
  `otpAction === 'deviceCheck'` logic (re-sign-in with a temp password, start a session,
  navigate to dashboard) exists but nothing ever sets it — device-check OTP is actually handled
  entirely by the separate Reactivation flow (§9), not here.
- **CourseDetail's "Start Fresh" path**: `handleStartProtocol(startIndex, clearState)` supports
  clearing progress and starting over, but no visible button wires to it — only "Resume
  Session" and "Jump to Qn" are rendered.
- **Affiliate "pending" state**: the UI renders an "awaiting approval" view for
  `affiliateStatus === 'pending'`, but the current client code never actually sets that value —
  every activation path goes straight to `'active'`. Either a manual-approval tier was removed,
  or was never finished.
- **"All Time" leaderboard is an approximation, not a true sum**: it ranks by the top 1000
  `dailyPractice` docs by single-day `attempted` value, which can under-count a user whose
  practice is spread across many smaller days rather than concentrated in a few big ones.
  Decide the intended semantics (true all-time sum vs. this approximation) before reproducing
  it.
- **Biometric credential storage is not secure storage**: the password is recovered via a
  hardcoded XOR key shipped in the client bundle, stored in localStorage. Anyone with
  localStorage access and the (public, bundled) key can recover the plaintext password. Decide
  deliberately whether to keep this convenience-over-security tradeoff or require a proper
  secure-enclave/keychain-backed credential in a rebuild.
- **Notifications' "auto-purge after 30 days" claim is UI copy with no backing
  implementation.** If kept, it needs an actual scheduled job; if not, the copy should go.
- **Password-strength inconsistency**: registration enforces 8+ chars with mixed character
  classes; Account Settings' password-change only enforces 6+ chars with no class requirements.
  Decide on one standard.
- **OTP/security-clearance emails always go to one hardcoded address**
  (`peteradekunle923@gmail.com`), never the acting admin's own inbox — worth deciding whether
  multi-admin deployments need this parameterized.
- **Duplicated OTP implementations**: the Departments tab maintains its own fully separate
  copy of the security-clearance modal/state/logic rather than sharing the top-level one in
  `AdminDashboard`. Collapse to one shared mechanism in a rebuild.
- **Hardcoded super-admin bypass**: `peteradekunle923@gmail.com` is always treated as admin —
  exempt from the device-limit/blocking logic — regardless of the `role` field, baked into
  client code in at least three places (Login.tsx ×2, AuthContext.tsx, the biometrics
  device-skip check). Decide whether to keep a break-glass account or replace it with a proper
  role/claims mechanism.
- **Every new signup is auto-granted full affiliate/partner status** (`isAffiliate: true`,
  `isPartner: true`, `hasPaidAffiliateFee: true`, `affiliateStatus: 'active'`, a personal
  referral code) at creation. Field names like `hasPaidAffiliateFee` suggest a paywalled/
  approval-gated affiliate tier once existed; none exists in the current code path. Decide
  whether to keep "every user is a partner from day one" as the real policy.
- **Three independent, un-reconciled local device identifiers** (`diamond_device_id`,
  `diamond_device_biometric_id`, and the ephemeral per-login SHA-256 "deviceInfo" hash) exist
  in localStorage/Firestore session metadata, serving three different, overlapping purposes.
  Consolidate deliberately rather than reproducing all three.
- **System Logs displays raw issued OTP codes** in the admin UI (large blue monospace text) —
  a security-sensitive detail worth a deliberate decision (redact, or restrict the log view
  further) rather than silently carrying it forward.
- **No expiry/subscription model anywhere**: department access, once paid, is permanent unless
  an admin suspends/deletes the account. See README's
  [Payment & access model](./README.md#payment--access-model) for exactly what three places
  would need to change together if time-limited access is ever wanted.
