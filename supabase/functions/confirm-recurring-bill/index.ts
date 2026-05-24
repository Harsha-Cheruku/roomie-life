import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { run_id, action } = await req.json();
    if (!run_id || !["approve", "skip"].includes(action)) {
      return json({ error: "Invalid payload" }, 400);
    }

    const { data: run, error: runErr } = await admin
      .from("recurring_bill_runs")
      .select("id, run_date, status, expense_id, recurring_bill_id")
      .eq("id", run_id)
      .single();
    if (runErr || !run) return json({ error: "Run not found" }, 404);
    if (run.status !== "pending" || run.expense_id) {
      return json({ error: "Already decided" }, 409);
    }

    const { data: tpl, error: tplErr } = await admin
      .from("recurring_bills")
      .select("*, recurring_bill_splits(user_id, amount)")
      .eq("id", run.recurring_bill_id)
      .single();
    if (tplErr || !tpl) return json({ error: "Template not found" }, 404);
    if (tpl.created_by !== user.id) return json({ error: "forbidden" }, 403);

    if (action === "skip") {
      await admin
        .from("recurring_bill_runs")
        .update({ status: "skipped", decided_at: new Date().toISOString(), decided_by: user.id })
        .eq("id", run.id);
      return json({ ok: true, skipped: true });
    }

    // Approve → create the expense + splits + notifications
    const { data: expense, error: expErr } = await admin
      .from("expenses")
      .insert({
        room_id: tpl.room_id,
        created_by: tpl.created_by,
        paid_by: tpl.paid_by,
        title: tpl.title,
        total_amount: tpl.total_amount,
        category: tpl.category,
        notes: tpl.notes,
        split_type: tpl.split_type,
        status: "pending",
      })
      .select()
      .single();
    if (expErr || !expense) return json({ error: expErr?.message || "expense insert failed" }, 500);

    const splits = (tpl.recurring_bill_splits || []).map((s: any) => ({
      expense_id: expense.id,
      user_id: s.user_id,
      amount: s.amount,
      status: "pending",
      is_paid: s.user_id === tpl.paid_by,
    }));
    if (splits.length > 0) await admin.from("expense_splits").insert(splits);

    const notifyRows = splits
      .filter((s: any) => s.user_id !== tpl.paid_by)
      .map((s: any) => ({
        user_id: s.user_id,
        room_id: tpl.room_id,
        type: "expense",
        title: `🔁 Recurring: ${tpl.title}`,
        body: `Your share: ${s.amount}`,
        reference_type: "expense",
        reference_id: expense.id,
        is_read: false,
      }));
    if (notifyRows.length > 0) await admin.from("notifications").insert(notifyRows);

    await admin
      .from("recurring_bill_runs")
      .update({
        status: "approved",
        expense_id: expense.id,
        decided_at: new Date().toISOString(),
        decided_by: user.id,
      })
      .eq("id", run.id);

    return json({ ok: true, expense_id: expense.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}