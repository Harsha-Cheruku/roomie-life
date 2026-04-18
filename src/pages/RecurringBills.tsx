import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Repeat, ArrowLeft } from "lucide-react";
import { CreateRecurringBillDialog } from "@/components/expenses/CreateRecurringBillDialog";
import { format } from "date-fns";

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
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RecurringBills = () => {
  const navigate = useNavigate();
  const { currentRoom, user } = useAuth();
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

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
      setBills(data || []);
    }
    setLoading(false);
  }, [currentRoom]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

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
      <TopBar />
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
        ) : bills.length === 0 ? (
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
            {bills.map((b) => (
              <Card key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{b.title}</h3>
                      {!b.is_active && <Badge variant="secondary">Paused</Badge>}
                    </div>
                    <p className="text-2xl font-bold mt-1">₹{b.total_amount}</p>
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
            ))}
          </div>
        )}
      </div>

      <CreateRecurringBillDialog open={showCreate} onOpenChange={setShowCreate} onCreated={fetchBills} />
      <BottomNav />
    </div>
  );
};

export default RecurringBills;
