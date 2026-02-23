import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"

    let alarmsTriggered = 0;

    // ── ALARMS ──────────────────────────────────────────────
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
        const alarmTime = alarm.alarm_time.slice(0, 5);
        if (alarmTime !== currentTimeStr) continue;

        // Idempotent: check if already triggered in last 2 minutes
        const twoMinAgo = new Date(now.getTime() - 120000).toISOString();
        const { data: existing } = await supabase
          .from("alarm_triggers")
          .select("id")
          .eq("alarm_id", alarm.id)
          .gte("triggered_at", twoMinAgo)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Create trigger
        const { error: triggerErr } = await supabase
          .from("alarm_triggers")
          .insert({
            alarm_id: alarm.id,
            status: "ringing",
            ring_count: 0,
          });

        if (triggerErr) continue;
        alarmsTriggered++;

        // Notify room members
        const { data: members } = await supabase
          .from("room_members")
          .select("user_id")
          .eq("room_id", alarm.room_id);

        if (members) {
          const notifications = members.map((m) => ({
            user_id: m.user_id,
            room_id: alarm.room_id,
            type: "alarm",
            title: `🔔 Alarm: ${alarm.title}`,
            body: `It's ${alarmTime}! Alarm is ringing.`,
            reference_type: "alarm",
            reference_id: alarm.id,
            is_read: false,
          }));

          await supabase.from("notifications").insert(notifications);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alarmsTriggered,
        checkedAt: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-alarms-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
