import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Member {
  user_id: string;
  display_name: string;
  avatar: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function computeNextRun(frequency: "weekly" | "monthly", dow: number, dom: number): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const next = new Date(today);
  if (frequency === "weekly") {
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (next.getUTCDay() !== dow);
  } else {
    const target = Math.min(dom, 28);
    if (today.getUTCDate() < target) {
      next.setUTCDate(target);
    } else {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(target);
    }
  }
  return next.toISOString().slice(0, 10);
}

export const CreateRecurringBillDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const { currentRoom, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("general");
  const [paidBy, setPaidBy] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !currentRoom) return;
    (async () => {
      const { data: rms } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("room_id", currentRoom.id);
      const ids = rms?.map((r) => r.user_id) || [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar")
        .in("user_id", ids);
      setMembers(profs || []);
      if (user) setPaidBy(user.id);
    })();
  }, [open, currentRoom, user]);

  const handleSave = async () => {
    if (!currentRoom || !user) return;
    const amt = parseFloat(amount);
    if (!title.trim() || !amt || amt <= 0) {
      toast.error("Please enter a valid title and amount");
      return;
    }
    if (members.length === 0) {
      toast.error("No room members found");
      return;
    }
    setSaving(true);
    try {
      const nextRun = computeNextRun(frequency, dayOfWeek, dayOfMonth);
      const { data: tpl, error } = await supabase
        .from("recurring_bills")
        .insert({
          room_id: currentRoom.id,
          created_by: user.id,
          title: title.trim(),
          total_amount: amt,
          category,
          paid_by: paidBy,
          split_type: "equal",
          frequency,
          day_of_week: frequency === "weekly" ? dayOfWeek : null,
          day_of_month: frequency === "monthly" ? dayOfMonth : null,
          next_run_date: nextRun,
          is_active: true,
        })
        .select()
        .single();
      if (error || !tpl) throw error;

      // Equal splits
      const per = Math.floor((amt * 100) / members.length) / 100;
      const remainder = Math.round((amt - per * members.length) * 100) / 100;
      const splits = members.map((m, i) => ({
        recurring_bill_id: tpl.id,
        user_id: m.user_id,
        amount: i === 0 ? per + remainder : per,
      }));
      const { error: sErr } = await supabase.from("recurring_bill_splits").insert(splits);
      if (sErr) throw sErr;

      toast.success("Recurring bill created");
      setTitle("");
      setAmount("");
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>🔁 New Recurring Bill</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4 pb-8">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rent, Internet, etc." />
          </div>
          <div>
            <Label>Total Amount</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="rent">🏠 Rent</SelectItem>
                <SelectItem value="utilities">⚡ Utilities</SelectItem>
                <SelectItem value="internet">🌐 Internet</SelectItem>
                <SelectItem value="groceries">🛒 Groceries</SelectItem>
                <SelectItem value="subscription">📺 Subscription</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paid By</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger><SelectValue placeholder="Select payer" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.avatar} {m.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v: "weekly" | "monthly") => setFrequency(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frequency === "weekly" ? (
            <div>
              <Label>Day of Week</Label>
              <Select value={String(dayOfWeek)} onValueChange={(v) => setDayOfWeek(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Day of Month (1–28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Bill auto-generates and splits equally among all room members. Members get notified to accept/reject.
          </p>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Recurring Bill"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
