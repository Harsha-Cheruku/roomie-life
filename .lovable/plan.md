

# Alarm System Enhancement Plan

## Summary
Enhance the alarm system with continuous ringing, instant stop, ringtone customization, admin KPI dashboard, and improved reliability. The app is a web+Capacitor hybrid — native background execution requires Capacitor plugins (already set up), while web relies on the existing cron+realtime architecture.

## Technical Analysis

**Current State**: Alarms trigger via a cron Edge Function every minute, create `alarm_triggers` rows, and the client picks them up via Realtime + 10s polling. Sound plays via Web Audio API with vibration fallback. Ringtone is stored in localStorage but selection is only at creation time.

**Key Issues**:
1. Sound stops after initial play attempt fails or beep pattern gets cleared prematurely
2. No volume ramp-up
3. Stop action goes through an Edge Function (network latency)
4. No admin alarm KPI dashboard
5. Dismissed alarms still visible in alarm list (already filtered, but triggers show in debug)

---

## Changes

### 1. Fix Continuous Ringing (`useAlarmSound.ts`)
- Remove the `cleanupCalledRef` guard that prevents re-play after cleanup
- Make audio loop truly continuous — if audio element errors mid-play, restart it automatically via `onerror`/`onended` handlers
- Add gradual volume ramp: start at 0.3, increase to 1.0 over 30 seconds using `setInterval`
- Keep beep pattern running as parallel fallback (don't clear it when audio loads — instead lower beep volume)
- Continuous vibration pattern: change interval from 2s to 1.5s with longer bursts

### 2. Instant Stop Action (`ActiveAlarmModal.tsx`)
- Stop sound **immediately** on button tap (call `stopAlarm()` synchronously before the async dismiss call)
- Then fire the Edge Function dismiss in background
- Add a large full-width STOP button with `h-16` height for easy tap target
- Show full-screen overlay style (destructive background, pulsing animation)

### 3. Ringtone Selection on Alarms Page (`Alarms.tsx`)
- Add a ringtone selector that saves to localStorage globally (not per-alarm)
- Show current ringtone on each alarm card
- Allow changing ringtone from the alarms list page via a settings row at the top (already partially there, make it interactive)

### 4. Admin Alarm KPI Dashboard (`AdminPanel.tsx`)
- Add a 5th KPI card: "Alarms" → navigates to `/alarms`
- Add an "Alarms" tab in the admin tabs section
- Fetch from `alarms` (count active) and `alarm_triggers` (count ringing, dismissed, calculate avg response time from `triggered_at` to `dismissed_at`)
- Display: Total alarms, Triggered today, Missed (stale dismissed), Avg dismiss time

### 5. Reliability Improvements
- **`useGlobalAlarm.ts`**: Reduce poll interval from 10s to 5s for faster trigger detection
- **`check-alarms-reminders`**: Already runs every minute via cron — no change needed
- **Native alarms**: Already using `@capacitor/local-notifications` with `allowWhileIdle: true` — this handles background/locked/killed scenarios on native builds
- **Web limitation note**: Browser-based alarms cannot ring when the tab is closed — this is a platform limitation. The Capacitor native build handles this correctly.

### 6. One-Time vs Repeating Alarm (`CreateAlarmDialog.tsx`)
- Add a "Repeat" toggle: when OFF, `days_of_week` is set to just today's day
- After a one-time alarm triggers, the Edge Function marks `is_active = false`

### 7. Role-Based Control
- Already implemented: only creator can delete alarms (RLS policy + UI check)
- Add admin override: if user is admin, show delete button on all alarms (admin can delete any alarm)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useAlarmSound.ts` | Fix continuous ringing, volume ramp, resilient audio loop |
| `src/components/alarms/ActiveAlarmModal.tsx` | Instant stop (sync sound kill), bigger stop button, full-screen style |
| `src/pages/Alarms.tsx` | Interactive ringtone picker, admin delete access, filter dismissed |
| `src/components/alarms/CreateAlarmDialog.tsx` | One-time/repeat toggle |
| `src/hooks/useGlobalAlarm.ts` | 5s poll interval, improved retry logic |
| `src/pages/AdminPanel.tsx` | Alarm KPI card + alarm stats tab |
| `supabase/functions/check-alarms-reminders/index.ts` | Auto-deactivate one-time alarms after trigger |

