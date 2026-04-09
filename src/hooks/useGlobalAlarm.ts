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

// Ignore triggers older than 90 seconds to prevent stale alarms replaying on app open
const FRESH_TRIGGER_WINDOW_MS = 90_000;

export function useGlobalAlarm() {
  const { user, currentRoom } = useAuth();
  const deviceId = useDeviceId();
  const { playAlarm, stopAlarm, preloadAudio } = useAlarmSound();

  const [activeTrigger, setActiveTrigger] = useState<AlarmTrigger | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<Alarm | null>(null);
  const isPlayingRef = useRef(false);
  const playAttemptedRef = useRef(false);
  const pollIntervalRef = useRef<number | null>(null);

  const roomId = currentRoom?.id || null;

  // Suppress web audio on native platforms (native AlarmService handles it)
  const isNative = typeof (window as any)?.Capacitor !== 'undefined' &&
    (window as any)?.Capacitor?.isNativePlatform?.() === true;

  useEffect(() => { preloadAudio(); }, [preloadAudio]);

  const fetchActiveTrigger = useCallback(async () => {
    if (!roomId) return;
    try {
      const { data: triggers, error } = await supabase
        .from("alarm_triggers")
        .select("*, alarms!inner(*)")
        .eq("status", "ringing")
        .eq("alarms.room_id", roomId)
        .order("triggered_at", { ascending: false })
        .limit(1);

      if (error) { console.error("Global alarm: fetch error", error); return; }

      if (triggers && triggers.length > 0) {
        const t = triggers[0];
        // Check freshness — ignore stale triggers
        const triggerAge = Date.now() - new Date(t.triggered_at).getTime();
        if (triggerAge > FRESH_TRIGGER_WINDOW_MS) {
          // Auto-dismiss stale trigger
          setActiveTrigger(null);
          setActiveAlarm(null);
          return;
        }
        setActiveTrigger({
          id: t.id, alarm_id: t.alarm_id, ring_count: t.ring_count,
          status: t.status, dismissed_by: t.dismissed_by, triggered_at: t.triggered_at,
        });
        setActiveAlarm(t.alarms as unknown as Alarm);
      } else {
        setActiveTrigger(null);
        setActiveAlarm(null);
      }
    } catch (err) { console.error("Global alarm: fetch error", err); }
  }, [roomId]);

  // Poll every 5s + realtime subscription
  useEffect(() => {
    if (!roomId) return;
    fetchActiveTrigger();

    pollIntervalRef.current = window.setInterval(fetchActiveTrigger, 5000);

    const channel = supabase
      .channel(`global-alarm-triggers-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alarm_triggers" },
        () => { fetchActiveTrigger(); }
      )
      .subscribe();

    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchActiveTrigger]);

  // Control sound based on active trigger + ownership
  useEffect(() => {
    if (!activeTrigger || !activeAlarm || !user) {
      if (isPlayingRef.current) {
        stopAlarm();
        isPlayingRef.current = false;
      }
      playAttemptedRef.current = false;
      return;
    }

    const isOwnerDevice =
      user.id === activeAlarm.created_by &&
      (!activeAlarm.owner_device_id || activeAlarm.owner_device_id === deviceId);

    if (isOwnerDevice && !isPlayingRef.current && !isNative) {
      isPlayingRef.current = true;
      playAttemptedRef.current = true;
      playAlarm().catch((err) => {
        console.error("Global alarm: failed to play", err);
        isPlayingRef.current = false;
      });
    } else if (!isOwnerDevice && isPlayingRef.current) {
      stopAlarm();
      isPlayingRef.current = false;
    }
  }, [activeTrigger, activeAlarm, user, deviceId, playAlarm, stopAlarm]);

  // Stop sound when trigger cleared
  useEffect(() => {
    if (!activeTrigger && isPlayingRef.current) {
      stopAlarm();
      isPlayingRef.current = false;
    }
  }, [activeTrigger, stopAlarm]);

  const retryPlayAlarm = useCallback(() => {
    if (!activeTrigger || !activeAlarm || !user) return;
    const isOwnerDevice =
      user.id === activeAlarm.created_by &&
      (!activeAlarm.owner_device_id || activeAlarm.owner_device_id === deviceId);
    if (isOwnerDevice && playAttemptedRef.current) {
      playAlarm().catch(() => {});
    }
  }, [activeTrigger, activeAlarm, user, deviceId, playAlarm]);

  const handleDismissed = useCallback(() => {
    stopAlarm();
    isPlayingRef.current = false;
    playAttemptedRef.current = false;
    setActiveTrigger(null);
    setActiveAlarm(null);
  }, [stopAlarm]);

  return { activeTrigger, activeAlarm, handleDismissed, retryPlayAlarm };
}
