
Goal: make Alarm behavior reliable and predictable with priority on your reported failure mode (not ringing when Alarm page is closed, app backgrounded, or app not in foreground), while keeping “only alarm setter gets audible alarm” and condition-based dismissal for others.

What I found in the current implementation
1. Ring logic is page-scoped, not app-scoped
- `ActiveAlarmModal` (sound playback) is mounted only inside `src/pages/Alarms.tsx`.
- If user is on Home/Tasks/etc, that modal never mounts, so no in-app ringing even when trigger exists.

2. Closed-app/background guarantee is incomplete
- Backend creates `notifications` rows, but no actual server web-push sender is wired.
- `push_subscriptions` table exists but there is no code inserting subscriptions.
- Current “push” is mostly realtime + local notifications, which fails when tab/app is fully closed.

3. Trigger lifecycle is unstable
- Many `alarm_triggers` stay in `ringing` forever (seen in data), causing stale-active state and race risk.
- No single-active-trigger guarantee per alarm.
- `ring_count` is never advanced in DB; condition checks are mostly local UI math only.

4. Dismiss condition logic is partially implemented
- `owner_only` and `after_rings` are client-side checks.
- `multiple_ack` is listed in UI but not actually enforced in backend.
- No atomic server-side condition validation before stopping.

5. Legacy dead code still exists
- `checkAndTriggerAlarms` client trigger path exists in `Alarms.tsx` but is not the authoritative stable path.

Implementation plan (single focused refactor: alarm only)
Phase 1 — Make backend the source of truth for alarm state
A) Harden alarm trigger generation function (existing scheduled function)
- Keep scheduled backend check every minute.
- For each due alarm, insert trigger only if no active `ringing` trigger already exists for that alarm.
- Add idempotent protections:
  - unique/partial index to prevent duplicate active triggers per alarm
  - strict due-window + “already-triggered-today” guard
- Persist metadata to support conditions (triggered_at already exists, can derive ring count server-side from elapsed time).

B) Add atomic server-side stop endpoint for alarm dismissal
- Create a dedicated backend function (e.g. `dismiss-alarm`) that:
  - validates caller auth
  - locks trigger row
  - checks current status is `ringing`
  - checks condition (`owner_only`, `after_rings`, `multiple_ack`)
  - inserts acknowledgment row when needed
  - transitions trigger to `dismissed` once condition is satisfied
- Prevent double-stop and stale writes with conditional update.

C) Cleanup stale ringing triggers
- Add safety logic to close stale `ringing` triggers that are no longer valid (e.g., alarm deleted/inactive or explicit stop path).
- Ensure deletion of alarm force-dismisses active trigger immediately.

Phase 2 — Ensure ringing works when Alarm page is closed
A) Move active alarm listener to app shell level
- Introduce a global hook/component mounted from `Index` (not `/alarms` page) that:
  - subscribes to alarm trigger updates once per room
  - fetches active trigger + alarm metadata
  - controls play/stop alarm audio based on trigger state and ownership
- Result: if user is on Home, Tasks, Chat, etc., alarm still rings in-app.

B) Keep owner-device audible behavior
- Audible loop + vibration only when:
  - user is alarm creator
  - `owner_device_id` matches current device id
- Non-owner devices remain silent but can get dismissal UI/notification as allowed.

C) Condition-aware dismiss UX
- Modal/button state is derived from backend condition result (not only local ring math).
- Others can dismiss only when condition threshold is truly met.

Phase 3 — Make closed/background notification path real (Web Push)
A) Register real browser push subscription
- Update push hook to:
  - register service worker once
  - create `PushManager` subscription
  - upsert into `push_subscriptions` (dedupe by user+endpoint)
  - gracefully handle denied permission

B) Send Web Push from backend when alarm triggers
- On trigger creation, send push payloads to room member subscriptions:
  - creator device/user payload: audible/high priority, require interaction
  - others: silent payload
- Remove invalid endpoints on push failures (410/404 cleanup).

C) Service worker payload handling hardening
- Update `public/sw.js` to respect payload flags (`silent`, `requireInteraction`, route).
- Prevent one-size-fits-all vibration/sound behavior.

Important expectation alignment (web platform reality)
- When the web app is fully terminated, continuous custom looping ringtone cannot be guaranteed like native Android alarm APIs.
- What will be guaranteed:
  - backend-triggered Web Push delivery path
  - prominent alarm notification (sound/vibration/requireInteraction) for setter
  - immediate in-app looping alarm when app/tab is alive (foreground or background tab still loaded).

Phase 4 — Remove conflicting client-side alarm logic
- Remove non-authoritative/local trigger code from `Alarms.tsx` (client due-time trigger path).
- Keep page focused on CRUD/settings + showing current state from backend.
- Keep one realtime listener path per room to avoid duplicated handlers.

Database and backend adjustments
1. SQL changes
- Add/ensure indexes:
  - due-time query index on alarms
  - partial unique index for one active ringing trigger per alarm
- Optional helper function/index for fast active-trigger lookup by room.
- Keep existing RLS behavior; enforce extra permission checks in dismissal function.

2. Backend function changes
- Refactor scheduled alarm processor for idempotent triggering + push fanout.
- Add dedicated atomic dismiss function for condition validation and acknowledgments.

3. Cron
- Keep alarm processor every minute (already scheduled), but stabilize idempotency and locking behavior.

Frontend files likely touched
- `src/pages/Alarms.tsx` (remove local triggering, consume authoritative state)
- `src/components/alarms/ActiveAlarmModal.tsx` (condition UX + backend-driven dismiss)
- `src/pages/Index.tsx` (mount global alarm listener)
- new global hook/component for active alarm orchestration
- `src/hooks/usePushNotifications.ts` (real subscription registration + upsert)
- `public/sw.js` (payload-aware behavior)

Verification plan after refactor
1) Alarm critical path
- Set alarm 2–3 min ahead as creator device.
- Keep app on Home (not Alarms page) -> verify audible ring starts.
- Put app in background tab -> verify behavior.
- Fully close tab/app -> verify creator receives push alarm notification.
- Verify non-creator gets silent notification.

2) Dismiss rules
- `owner_only`: non-owner cannot stop.
- `after_rings`: non-owner blocked until threshold, then can stop.
- `multiple_ack`: requires configured acknowledgments before stop.
- Once dismissed, all devices stop immediately.

3) Regression/race tests
- Ensure one trigger per alarm firing window.
- Ensure no duplicate push sends.
- Ensure deleting alarm prevents future ring.
- Ensure stale ringing trigger cleanup works.

4) Data sanity checks
- Confirm no perpetual `ringing` records after proper stop/deletion flow.
- Confirm push_subscriptions are deduplicated and invalid endpoints removed.

Expected outcome
- Alarm no longer depends on keeping `/alarms` screen open.
- Owner-device-only audible behavior is enforced.
- Others can dismiss only when condition is satisfied.
- Closed/background behavior is stabilized through proper backend Web Push pipeline and global alarm listener architecture.
