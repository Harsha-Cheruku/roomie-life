import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoomMembers } from "@/hooks/useRoomMembers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Users, CheckCircle2 } from "lucide-react";

interface AdminDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: "expense" | "task";
  itemId: string;
  itemTitle: string;
  onDeleted: () => void;
  requiredApprovals?: number;
}

interface PendingDeletion {
  id: string;
  item_type: string;
  item_id: string;
  requested_by: string;
  approvals: string[];
  required_approvals: number;
  created_at: string;
}

export function AdminDeleteDialog({
  open,
  onOpenChange,
  itemType,
  itemId,
  itemTitle,
  onDeleted,
  requiredApprovals = 2,
}: AdminDeleteDialogProps) {
  const { user, currentRoom } = useAuth();
  const { members } = useRoomMembers();
  const [deleting, setDeleting] = useState(false);
  const [confirmCheck, setConfirmCheck] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && itemId) {
      checkPendingDeletion();
    }
  }, [open, itemId]);

  const checkPendingDeletion = async () => {
    setLoading(true);
    try {
      // Check if there's already a pending deletion request for this item
      // For now, we'll use the notifications table to track approvals
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("reference_type", `delete_${itemType}`)
        .eq("reference_id", itemId)
        .eq("type", "deletion_request")
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        // Parse approvals from the body field (stored as JSON)
        try {
          const parsed = JSON.parse(data[0].body || "{}");
          setPendingDeletion({
            id: data[0].id,
            item_type: itemType,
            item_id: itemId,
            requested_by: parsed.requested_by || "",
            approvals: parsed.approvals || [],
            required_approvals: parsed.required_approvals || requiredApprovals,
            created_at: data[0].created_at,
          });
        } catch {
          setPendingDeletion(null);
        }
      } else {
        setPendingDeletion(null);
      }
    } catch (error) {
      console.error("Error checking pending deletion:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!user || !currentRoom) return;

    setDeleting(true);
    try {
      // Create deletion request notification for all room members
      const notificationData = {
        requested_by: user.id,
        approvals: [user.id], // Requester auto-approves
        required_approvals: requiredApprovals,
        item_title: itemTitle,
      };

      // Create notification for each room member
      const notifications = members.map((member) => ({
        user_id: member.user_id,
        room_id: currentRoom.id,
        type: "deletion_request",
        title: `🗑️ Deletion Request: ${itemTitle}`,
        body: JSON.stringify(notificationData),
        reference_type: `delete_${itemType}`,
        reference_id: itemId,
        is_read: member.user_id === user.id, // Requester has already seen it
      }));

      const { error } = await supabase.from("notifications").insert(notifications);

      if (error) throw error;

      toast.success("Deletion request sent to room members for approval");
      onOpenChange(false);
      checkPendingDeletion();
    } catch (error) {
      console.error("Error creating deletion request:", error);
      toast.error("Failed to create deletion request");
    } finally {
      setDeleting(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !pendingDeletion) return;

    setDeleting(true);
    try {
      const newApprovals = [...pendingDeletion.approvals, user.id];
      const updatedData = {
        ...JSON.parse(
          (
            await supabase
              .from("notifications")
              .select("body")
              .eq("id", pendingDeletion.id)
              .single()
          ).data?.body || "{}"
        ),
        approvals: newApprovals,
      };

      // Update all notifications with new approvals
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ body: JSON.stringify(updatedData) })
        .eq("reference_type", `delete_${itemType}`)
        .eq("reference_id", itemId)
        .eq("type", "deletion_request");

      if (updateError) throw updateError;

      // Check if we have enough approvals
      if (newApprovals.length >= pendingDeletion.required_approvals) {
        // Execute the deletion
        if (itemType === "expense") {
          // Delete expense splits first
          await supabase.from("expense_splits").delete().eq("expense_id", itemId);
          await supabase.from("expense_items").delete().eq("expense_id", itemId);
          await supabase.from("expenses").delete().eq("id", itemId);
        } else if (itemType === "task") {
          await supabase.from("tasks").delete().eq("id", itemId);
        }

        // Delete the notification requests
        await supabase
          .from("notifications")
          .delete()
          .eq("reference_type", `delete_${itemType}`)
          .eq("reference_id", itemId)
          .eq("type", "deletion_request");

        toast.success(`${itemType === "expense" ? "Expense" : "Task"} deleted successfully`);
        onDeleted();
        onOpenChange(false);
      } else {
        toast.success(
          `Approval recorded (${newApprovals.length}/${pendingDeletion.required_approvals})`
        );
        checkPendingDeletion();
      }
    } catch (error) {
      console.error("Error approving deletion:", error);
      toast.error("Failed to approve deletion");
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!pendingDeletion) return;

    setDeleting(true);
    try {
      await supabase
        .from("notifications")
        .delete()
        .eq("reference_type", `delete_${itemType}`)
        .eq("reference_id", itemId)
        .eq("type", "deletion_request");

      toast.success("Deletion request cancelled");
      setPendingDeletion(null);
      onOpenChange(false);
    } catch (error) {
      console.error("Error cancelling deletion:", error);
      toast.error("Failed to cancel deletion request");
    } finally {
      setDeleting(false);
    }
  };

  const hasUserApproved = pendingDeletion?.approvals.includes(user?.id || "");
  const isRequester = pendingDeletion?.requested_by === user?.id;
  const approvalsCount = pendingDeletion?.approvals.length || 0;

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete {itemType === "expense" ? "Expense" : "Task"}
          </DialogTitle>
          <DialogDescription>
            {pendingDeletion
              ? "This item has a pending deletion request. Approval from multiple members is required."
              : "This action requires approval from multiple room members before the item can be deleted."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-medium">{itemTitle}</p>
            <p className="text-sm text-muted-foreground capitalize">{itemType}</p>
          </div>

          {pendingDeletion ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Approvals: {approvalsCount} / {pendingDeletion.required_approvals}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {members.map((member) => {
                  const hasApproved = pendingDeletion.approvals.includes(member.user_id);
                  return (
                    <Badge
                      key={member.user_id}
                      variant={hasApproved ? "default" : "outline"}
                      className="flex items-center gap-1"
                    >
                      {hasApproved && <CheckCircle2 className="h-3 w-3" />}
                      {member.display_name}
                    </Badge>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <Checkbox
                id="confirm"
                checked={confirmCheck}
                onCheckedChange={(checked) => setConfirmCheck(checked === true)}
              />
              <Label htmlFor="confirm" className="text-sm text-muted-foreground">
                I understand this will send a deletion request to all room members.
                At least {requiredApprovals} members must approve before the item is deleted.
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {pendingDeletion ? (
            <>
              {isRequester && (
                <Button
                  variant="outline"
                  onClick={handleCancelRequest}
                  disabled={deleting}
                >
                  Cancel Request
                </Button>
              )}
              {!hasUserApproved && (
                <Button
                  variant="destructive"
                  onClick={handleApprove}
                  disabled={deleting}
                >
                  {deleting ? "Approving..." : "Approve Deletion"}
                </Button>
              )}
              {hasUserApproved && (
                <Button variant="outline" disabled>
                  Already Approved
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRequestDeletion}
                disabled={deleting || !confirmCheck}
              >
                {deleting ? "Requesting..." : "Request Deletion"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
