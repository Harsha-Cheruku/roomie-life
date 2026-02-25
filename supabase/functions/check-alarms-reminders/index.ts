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
    const currentDay = now.getDay();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
    let staleDismissed = 0;
    let alarmsTriggered = 0;

    // Cleanup stale ringing triggers so they don't block future alarms
    const { data: staleTriggers, error: staleErr } = await supabase
      .from("alarm_triggers")
      .select("id")
      .eq("status", "ringing")
      .lt("triggered_at", staleBefore.toISOString());

    if (staleErr) {
      console.error("Error fetching stale triggers:", staleErr);
    }

    if (staleTriggers && staleTriggers.length > 0) {
      const staleIds = staleTriggers.map((t) => t.id);
      const { error: staleDismissErr } = await supabase
        .from("alarm_triggers")
        .update({
          status: "dismissed",
          dismissed_at: now.toISOString(),
          dismissed_by: null,
        })
        .in("id", staleIds)
        .eq("status", "ringing");

      if (staleDismissErr) {
        console.error("Error dismissing stale triggers:", staleDismissErr);
      } else {
        staleDismissed = staleIds.length;
      }
    }

    const { data: alarms, error: alarmErr } = await supabase
      .from("alarms")
      .select("*")
      .eq("is_active", true)
      .contains("days_of_week", [currentDay]);

    if (alarmErr) {
      console.error("Error fetching alarms:", alarmErr);
    }

    if (alarms) {
      for (const alarm of alarms) {
        const alarmMinutes = timeToMinutes(alarm.alarm_time);
        const diffMinutes = nowMinutes - alarmMinutes;

        // Trigger within 0..5 minutes window to avoid missed exact-minute runs
        if (diffMinutes < 0 || diffMinutes > 5) continue;

        // Skip if this alarm already has a trigger today (idempotent daily lock)
        const { data: existingToday } = await supabase
          .from("alarm_triggers")
          .select("id,status")
          .eq("alarm_id", alarm.id)
          .gte("triggered_at", startOfDay.toISOString())
          .order("triggered_at", { ascending: false })
          .limit(1);

        if (existingToday && existingToday.length > 0) continue;

        // Create new trigger
        const { data: insertedTrigger, error: triggerErr } = await supabase
          .from("alarm_triggers")
          .insert({
            alarm_id: alarm.id,
            status: "ringing",
            ring_count: 0,
          })
          .select("id")
          .single();

        if (triggerErr || !insertedTrigger) {
          console.error("Error creating alarm trigger:", triggerErr);
          continue;
        }

        alarmsTriggered++;

        // Notify room members
        const { data: members } = await supabase
          .from("room_members")
          .select("user_id")
          .eq("room_id", alarm.room_id);

        if (members && members.length > 0) {
          const notifications = members.map((m) => ({
            user_id: m.user_id,
            room_id: alarm.room_id,
            type: "alarm",
            title: `🔔 Alarm: ${alarm.title}`,
            body: `It's ${alarm.alarm_time.slice(0, 5)}! Alarm is ringing.`,
            reference_type: "alarm",
            reference_id: alarm.id,
            is_read: false,
          }));

          const { error: notificationErr } = await supabase
            .from("notifications")
            .insert(notifications);

          if (notificationErr) {
            console.error("Error creating alarm notifications:", notificationErr);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alarmsTriggered,
        staleDismissed,
        checkedAt: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-alarms-reminders:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
