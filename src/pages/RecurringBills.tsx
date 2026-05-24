import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Repeat, ArrowLeft, Check, X } from "lucide-react";
import { CreateRecurringBillDialog } from "@/components/expenses/CreateRecurringBillDialog";
import { format } from "date-fns";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

interface RecurringBill {
  id: string;
  title: string;
  total_amount: number;
  category: string;
  frequency: string;
  day_of_week: number | null;
  day_of_month: number | null;
  next_run_date: string;
  last_run_date: string | null;
  is_active: boolean;
  created_by: string;
  paid_by: string;
}

interface PayerProfile {
  user_id: string;
  display_name: string;
  avatar: string | null;
}

interface PendingRun {
  id: string;
  recurring_bill_id: string;
  run_date: string;
  title: string;
  total_amount: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RecurringBills = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentRoom, user, isSoloMode } = useAuth();
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [payerProfiles, setPayerProfiles] = useState<Map<string, PayerProfile>>(new Map());
  const [pending, setPending] = useState<PendingRun[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!currentRoom || !user) return;
    const { data } = await supabase
      .from("recurring_bill_runs")
      .select("id, recurring_bill_id, run_date, status, expense_id, recurring_bills!inner(title,total_amount,created_by,room_id)")
      .eq("status", "pending")
      .is("expense_id", null)
      .eq("recurring_bills.room_id", currentRoom.id)
      .eq("recurring_bills.created_by", user.id);
    const rows: PendingRun[] = (data || []).map((r: any) => ({
      id: r.id,
      recurring_bill_id: r.recurring_bill_id,
      run_date: r.run_date,
      title: r.recurring_bills.title,
      total_amount: r.recurring_bills.total_amount,
    }));
    setPending(rows);
  }, [currentRoom, user]);

  const decide = async (run: PendingRun, action: "approve" | "skip") => {
    setDeciding(run.id);
    try {
      const { error } = await supabase.functions.invoke("confirm-recurring-bill", {
        body: { run_id: run.id, action },
      });
      if (error) throw error;
      toast.success(action === "approve" ? "Bill created" : "Skipped");
      await Promise.all([fetchPending(), fetchBills()]);
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setDeciding(null);
    }
  };

  const fetchBills = useCallback(async () => {
    if (!currentRoom) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("recurring_bills")
      .select("*")
      .eq("room_id", currentRoom.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load recurring bills");
    } else {
      const list = (data || []) as RecurringBill[];
      setBills(list);
      const userIds = Array.from(new Set(list.flatMap((b) => [b.paid_by, b.created_by]).filter(Boolean)));
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar")
          .in("user_id", userIds);
        const map = new Map<string, PayerProfile>();
        (profs || []).forEach((p: any) => map.set(p.user_id, p));
        setPayerProfiles(map);
      }
    }
    setLoading(false);
  }, [currentRoom]);

  // Solo mode: only show bills the user created or pays
  const visibleBills = bills.filter((b) => {
    if (!isSoloMode) return true;
    return b.created_by === user?.id || b.paid_by === user?.id;
  });

  useEffect(() => {
    fetchBills();
    fetchPending();
  }, [fetchBills, fetchPending]);

  // If user arrived via notification tap with ?confirm=<recurring_bill_id>, scroll the pending card into view
  useEffect(() => {
    const confirmId = searchParams.get("confirm");
    if (!confirmId) return;
    const el = document.getElementById(`pending-${confirmId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2400);
      // strip the query so refresh is clean
      searchParams.delete("confirm");
      setSearchParams(searchParams, { replace: true });
    }
  }, [pending, searchParams, setSearchParams]);

  const toggleActive = async (b: RecurringBill) => {
    const { error } = await supabase
      .from("recurring_bills")
      .update({ is_active: !b.is_active })
      .eq("id", b.id);
    if (error) toast.error("Failed to update");
    else {
      toast.success(b.is_active ? "Paused" : "Resumed");
      fetchBills();
    }
  };

  const deleteBill = async (id: string) => {
    if (!confirm("Delete this recurring bill? Already-generated bills will remain.")) return;
    const { error } = await supabase.from("recurring_bills").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      fetchBills();
    }
  };

  const scheduleLabel = (b: RecurringBill) => {
    if (b.frequency === "weekly" && b.day_of_week !== null) return `Every ${DAYS[b.day_of_week]}`;
    if (b.frequency === "monthly" && b.day_of_month !== null) return `Day ${b.day_of_month} monthly`;
    return b.frequency;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Recurring Bills" />
      <div className="px-4 py-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/expenses")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Repeat className="h-5 w-5" /> Recurring Bills
            </h1>
            <p className="text-xs text-muted-foreground">Auto-generate bills on schedule</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visibleBills.length === 0 && pending.length === 0 ? (
          <Card className="p-8 text-center">
            <Repeat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No recurring bills yet</p>
            <p className="text-sm text-muted-foreground mb-4">Set up rent, internet, or subscriptions to auto-generate.</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create First
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                  Awaiting your confirmation
                </p>
                {pending.map((p) => (
                  <Card
                    key={p.id}
                    id={`pending-${p.recurring_bill_id}`}
                    className="p-4 border-primary/40 bg-primary/5 transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{p.title}</p>
                        <p className="text-2xl font-bold mt-1">₹{p.total_amount}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Scheduled for {format(new Date(p.run_date), "PP")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => decide(p, "approve")}
                          disabled={deciding === p.id}
                        >
                          {deciding === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decide(p, "skip")}
                          disabled={deciding === p.id}
                        >
                          <X className="h-4 w-4 mr-1" /> Skip
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {visibleBills.map((b) => {
              const payer = payerProfiles.get(b.paid_by);
              const payerName = payer?.user_id === user?.id ? "You" : (payer?.display_name || "Roommate");
              return (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{b.title}</h3>
                      {!b.is_active && <Badge variant="secondary">Paused</Badge>}
                    </div>
                    <p className="text-2xl font-bold mt-1">₹{b.total_amount}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <ProfileAvatar avatar={payer?.avatar || "😊"} size="xs" />
                      <span className="text-xs text-muted-foreground">
                        Paid by <span className="font-medium text-foreground">{payerName}</span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{scheduleLabel(b)}</p>
                    <p className="text-xs text-muted-foreground">
                      Next: {format(new Date(b.next_run_date), "PP")}
                      {b.last_run_date && ` • Last: ${format(new Date(b.last_run_date), "PP")}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                    {b.created_by === user?.id && (
                      <Button variant="ghost" size="icon" onClick={() => deleteBill(b.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
              );
            })}
          </div>
        )}
      </div>

      <CreateRecurringBillDialog open={showCreate} onOpenChange={setShowCreate} onCreated={fetchBills} />
      <BottomNav activeTab="expenses" onTabChange={(tab) => {
        if (tab === 'home') navigate('/');
        else if (tab === 'tasks') navigate('/tasks');
        else if (tab === 'expenses') navigate('/expenses');
        else if (tab === 'chat') navigate('/chat');
        else if (tab === 'storage') navigate('/storage');
      }} />
    </div>
  );
};

export default RecurringBills;
