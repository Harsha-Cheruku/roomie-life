import { ActiveAlarmModal } from "@/components/alarms/ActiveAlarmModal";
import { useGlobalAlarm } from "@/hooks/useGlobalAlarm";

/**
 * App-wide alarm layer. Keeps alarm ringing and modal active
 * regardless of current route/page.
 */
export function GlobalAlarmLayer() {
  const { activeTrigger, activeAlarm, handleDismissed } = useGlobalAlarm();

  if (!activeTrigger || !activeAlarm) return null;

  return (
    <ActiveAlarmModal
      trigger={activeTrigger}
      alarm={activeAlarm}
      onDismissed={handleDismissed}
    />
  );
}
