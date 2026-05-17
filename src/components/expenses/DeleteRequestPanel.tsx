import { useEffect, useState, useCallback } from "react";
import { Loader2, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Props {
  expenseId: string;
  participantIds: string[]; // creator + split user_ids (distinct)
  onDeleted: () => void;
}

interface RequestRow {
  id: string;
  requested_by: string;
  status: string;
  created_at: string;
}
interface VoteRow {
  user_id: string;
  approve: boolean;
}

export const DeleteRequestPanel = ({ expenseId, participantIds, onDeleted }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const { data: req } = await supabase
      .from("expense_delete_requests")
      .select("id, requested_by, status, created_at")
      .eq("expense_id", expenseId)
      .eq("status", "pending")
      .maybeSingle();
    setRequest((req as RequestRow) || null);
    if (req) {
      const { data: v } = await supabase
        .from("expense_delete_votes")
        .select("user_id, approve")
        .eq("request_id", (req as RequestRow).id);
      setVotes((v as VoteRow[]) || []);
    } else {
      setVotes([]);
    }
  }, [expenseId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`del-req-${expenseId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_delete_requests", filter: `expense_id=eq.${expenseId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_delete_votes" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [expenseId, load]);

  if (!request || !user) return null;

  const others = participantIds.filter((p) => p !== request.requested_by);
  const approvals = votes.filter((v) => v.approve && v.user_id !== request.requested_by && others.includes(v.user_id)).length;
  const needed = Math.floor(others.length / 2) + 1;
  const myVote = votes.find((v) => v.user_id === user.id);
  const isRequester = request.requested_by === user.id;

  const vote = async (approve: boolean) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("vote_expense_delete", { _request_id: request.id, _approve: approve });
      if (error) throw error;
      if (data === "approved") {
        toast({ title: "Bill deleted", description: "Majority approved the deletion." });
        onDeleted();
        return;
      }
      toast({ title: approve ? "Approval recorded" : "Rejection recorded" });
      await load();
    } catch (e) {
      toast({ title: "Vote failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("cancel_expense_delete", { _request_id: request.id });
      if (error) throw error;
      toast({ title: "Request cancelled" });
      await load();
    } catch {
      toast({ title: "Cancel failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-coral/10 border border-coral/30 rounded-2xl p-4 shadow-card space-y-3">
      <h3 className="font-semibold text-coral flex items-center gap-2">
        <Trash2 className="w-4 h-4" /> Delete bill request
      </h3>
      <p className="text-sm text-foreground">
        {isRequester ? "You requested to delete this bill." : "A participant requested to delete this bill."}
        {" "}Majority approval is required ({approvals}/{needed} so far).
      </p>
      {isRequester ? (
        <Button variant="outline" size="sm" onClick={cancel} disabled={loading} className="gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          Cancel request
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-mint hover:bg-mint/90 gap-1" onClick={() => vote(true)} disabled={loading || myVote?.approve === true}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {myVote?.approve === true ? "Approved" : "Approve delete"}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 border-coral text-coral hover:bg-coral/10 gap-1" onClick={() => vote(false)} disabled={loading || myVote?.approve === false}>
            <X className="w-3 h-3" />
            {myVote?.approve === false ? "Rejected" : "Reject"}
          </Button>
        </div>
      )}
    </div>
  );
};