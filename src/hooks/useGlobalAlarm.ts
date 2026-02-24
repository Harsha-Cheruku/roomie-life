import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAlarmSound } from "@/hooks/useAlarmSound";
import { useDeviceId } from "@/hooks/useDeviceId";

interface AlarmTrigger {
  id: string;
  alarm_id: string;
  ring_count: number;
  status: string;
  dismissed_by: string | null;
  triggered_at: string;
}

interface Alarm {
  id: string;
  title: string;
  alarm_time: string;
  condition_type: string;
  condition_value: number;
  created_by: string;
  room_id: string;
  owner_device_id?: string | null;
}

/**
 * Global alarm hook — mounted at app shell level (Index.tsx).
 * Subscribes to alarm_triggers realtime for the user's room.
 * Controls sound playback for the alarm owner's device regardless of current page.
 */
export function useGlobalAlarm() {
  const { user, currentRoom } = useAuth();
  const deviceId = useDeviceId();
  const { playAlarm, stopAlarm, preloadAudio } = useAlarmSound();

  const [activeTrigger, setActiveTrigger] = useState<AlarmTrigger | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<Alarm | null>(null);
  const isPlayingRef = useRef(false);

  const roomId = currentRoom?.id || null;

  // Preload audio once
  useEffect(() => {
    preloadAudio();
  }, [preloadAudio]);

  const fetchActiveTrigger = useCallback(async () => {
    if (!roomId) return;

    const { data: triggers, error } = await supabase
      .from("alarm_triggers")
      .select("*, alarms!inner(*)")
      .eq("status", "ringing")
      .eq("alarms.room_id", roomId)
      .order("triggered_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Global alarm: error fetching active trigger", error);
      return;
    }

    if (triggers && triggers.length > 0) {
      const t = triggers[0];
      setActiveTrigger({
        id: t.id,
        alarm_id: t.alarm_id,
        ring_count: t.ring_count,
        status: t.status,
        dismissed_by: t.dismissed_by,
        triggered_at: t.triggered_at,
      });
      setActiveAlarm(t.alarms as unknown as Alarm);
    } else {
      setActiveTrigger(null);
      setActiveAlarm(null);
    }
  }, [roomId]);

  // Subscribe to trigger changes once per room
  useEffect(() => {
    if (!roomId) return;

    fetchActiveTrigger();

    const channel = supabase
      .channel(`global-alarm-triggers-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alarm_triggers",
        },
        () => {
          fetchActiveTrigger();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchActiveTrigger]);

  // Control sound based on active trigger + ownership
  useEffect(() => {
    if (!activeTrigger || !activeAlarm || !user) {
      // No active alarm — stop sound if playing
      if (isPlayingRef.current) {
        stopAlarm();
        isPlayingRef.current = false;
      }
      return;
    }

    const isOwnerDevice =
      user.id === activeAlarm.created_by &&
      activeAlarm.owner_device_id === deviceId;

    if (isOwnerDevice && !isPlayingRef.current) {
      isPlayingRef.current = true;
      playAlarm().catch((err) =>
        console.error("Global alarm: failed to play", err)
      );
    } else if (!isOwnerDevice && isPlayingRef.current) {
      stopAlarm();
      isPlayingRef.current = false;
    }

    return () => {
      // Cleanup when trigger changes
    };
  }, [activeTrigger, activeAlarm, user, deviceId, playAlarm, stopAlarm]);

  // Stop sound when trigger dismissed
  useEffect(() => {
    if (!activeTrigger && isPlayingRef.current) {
      stopAlarm();
      isPlayingRef.current = false;
    }
  }, [activeTrigger, stopAlarm]);

  const handleDismissed = useCallback(() => {
    stopAlarm();
    isPlayingRef.current = false;
    setActiveTrigger(null);
    setActiveAlarm(null);
  }, [stopAlarm]);

  return {
    activeTrigger,
    activeAlarm,
    handleDismissed,
  };
}
