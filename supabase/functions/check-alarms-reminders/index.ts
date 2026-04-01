import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const timeToMinutes = (timeValue: string) => {
  const [hh, mm] = timeValue.slice(0, 5).split(":").map(Number);
  return hh * 60 + mm;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
    let staleDismissed = 0;
    let alarmsTriggered = 0;
    let oneTimeDeactivated = 0;

    console.log(`[check-alarms] Running at UTC: ${now.toISOString()}`);

    // Cleanup stale ringing triggers (>30 min old)
    const { data: staleTriggers, error: staleErr } = await supabase
      .from("alarm_triggers")
      .select("id")
      .eq("status", "ringing")
      .lt("triggered_at", staleBefore.toISOString());

    if (staleErr) console.error("Error fetching stale triggers:", staleErr);

    if (staleTriggers && staleTriggers.length > 0) {
      const staleIds = staleTriggers.map((t: any) => t.id);
      const { error: staleDismissErr } = await supabase
        .from("alarm_triggers")
        .update({ status: "dismissed", dismissed_at: now.toISOString(), dismissed_by: null })
        .in("id", staleIds)
        .eq("status", "ringing");

      if (staleDismissErr) console.error("Error dismissing stale triggers:", staleDismissErr);
      else { staleDismissed = staleIds.length; console.log(`[check-alarms] Dismissed ${staleDismissed} stale triggers`); }
    }

    // Fetch all active alarms
    const { data: alarms, error: alarmErr } = await supabase
      .from("alarms")
      .select("*")
      .eq("is_active", true);

    if (alarmErr) console.error("Error fetching alarms:", alarmErr);
    console.log(`[check-alarms] Found ${alarms?.length || 0} active alarms`);

    if (alarms) {
      for (const alarm of alarms) {
        const tzOffset = alarm.timezone_offset || 0;
        const localNowMs = now.getTime() - tzOffset * 60 * 1000;
        const localNow = new Date(localNowMs);
        const localDay = localNow.getUTCDay();
        const localMinutes = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();

        if (!alarm.days_of_week || !alarm.days_of_week.includes(localDay)) continue;

        const alarmMinutes = timeToMinutes(alarm.alarm_time);
        const diffMinutes = localMinutes - alarmMinutes;
        if (diffMinutes < 0 || diffMinutes > 2) continue;

        console.log(`[check-alarms] Alarm "${alarm.title}" (${alarm.id}) is due!`);

        // Idempotent: skip if already triggered today
        const localStartOfDay = new Date(localNowMs);
        localStartOfDay.setUTCHours(0, 0, 0, 0);
        const utcStartOfDay = new Date(localStartOfDay.getTime() + tzOffset * 60 * 1000);

        const { data: existingToday } = await supabase
          .from("alarm_triggers")
          .select("id,status")
          .eq("alarm_id", alarm.id)
          .gte("triggered_at", utcStartOfDay.toISOString())
          .order("triggered_at", { ascending: false })
          .limit(1);

        if (existingToday && existingToday.length > 0) {
          console.log(`[check-alarms] Alarm "${alarm.title}" already triggered today, skipping`);
          continue;
        }

        // Create new trigger
        const { data: insertedTrigger, error: triggerErr } = await supabase
          .from("alarm_triggers")
          .insert({ alarm_id: alarm.id, status: "ringing", ring_count: 0 })
          .select("id")
          .single();

        if (triggerErr || !insertedTrigger) { console.error("Error creating alarm trigger:", triggerErr); continue; }

        alarmsTriggered++;
        console.log(`[check-alarms] ✅ Trigger created for "${alarm.title}", trigger_id=${insertedTrigger.id}`);

        // Auto-deactivate one-time alarms (days_of_week has only 1 day = today)
        if (alarm.days_of_week.length === 1) {
          const { error: deactivateErr } = await supabase
            .from("alarms")
            .update({ is_active: false })
            .eq("id", alarm.id);

          if (deactivateErr) console.error("Error deactivating one-time alarm:", deactivateErr);
          else { oneTimeDeactivated++; console.log(`[check-alarms] Deactivated one-time alarm "${alarm.title}"`); }
        }

        // Notify room members
        const { data: members } = await supabase
          .from("room_members")
          .select("user_id")
          .eq("room_id", alarm.room_id);

        if (members && members.length > 0) {
          const notifications = members.map((m: any) => ({
            user_id: m.user_id,
            room_id: alarm.room_id,
            type: "alarm",
            title: `🔔 Alarm: ${alarm.title}`,
            body: `It's ${alarm.alarm_time.slice(0, 5)}! Alarm is ringing.`,
            reference_type: "alarm",
            reference_id: alarm.id,
            is_read: false,
          }));

          const { error: notificationErr } = await supabase.from("notifications").insert(notifications);
          if (notificationErr) console.error("Error creating alarm notifications:", notificationErr);
        }
      }
    }

    console.log(`[check-alarms] Done. Triggered=${alarmsTriggered}, StaleDismissed=${staleDismissed}, OneTimeDeactivated=${oneTimeDeactivated}`);

    return new Response(
      JSON.stringify({ success: true, alarmsTriggered, staleDismissed, oneTimeDeactivated, checkedAt: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error in check-alarms-reminders:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
