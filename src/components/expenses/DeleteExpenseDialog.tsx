import { useState, useEffect } from 'react';
import { Trash2, Loader2, AlertTriangle, Check, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface DeleteExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: {
    id: string;
    title: string;
    total_amount: number;
    created_by: string;
  } | null;
  onDeleted: () => void;
}

interface DeletionApproval {
  user_id: string;
  approved: boolean | null;
  display_name?: string;
  avatar?: string;
}

export const DeleteExpenseDialog = ({
  open,
  onOpenChange,
  expense,
  onDeleted,
}: DeleteExpenseDialogProps) => {
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [approvals, setApprovals] = useState<DeletionApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && expense) {
      fetchApprovals();
    }
  }, [open, expense]);

  const fetchApprovals = async () => {
    if (!expense || !currentRoom) return;

    setIsLoading(true);
    try {
      // Get all split members for this expense
      const { data: splits, error: splitsError } = await supabase
        .from('expense_splits')
        .select('user_id')
        .eq('expense_id', expense.id);

      if (splitsError) throw splitsError;

      const userIds = [...new Set([
        expense.created_by,
        ...(splits?.map(s => s.user_id) || [])
      ])];

      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // For simplicity, we'll track approvals in the expense status
      // In a full implementation, you'd have a separate deletion_approvals table
      const approvalsList: DeletionApproval[] = userIds.map(userId => {
        const profile = profileMap.get(userId);
        return {
          user_id: userId,
          approved: userId === user?.id ? true : null, // Current user auto-approves if they initiated
          display_name: profile?.display_name || 'Unknown',
          avatar: profile?.avatar || '😊',
        };
      });

      setApprovals(approvalsList);
    } catch (error) {
      console.error('Error fetching approvals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!expense) return;

    setIsDeleting(true);
    try {
      // Check if user is the creator or if all approvals are received
      const allApproved = approvals.every(a => a.approved === true);
      const isCreator = expense.created_by === user?.id;

      // For solo bills (only creator involved), allow immediate deletion
      const isSoloBill = approvals.length === 1 && isCreator;

      if (!isSoloBill && !allApproved && !isCreator) {
        // Request deletion approval from others
        toast({
          title: 'Deletion requested',
          description: 'Waiting for approval from all members involved.',
        });
        onOpenChange(false);
        return;
      }

      // Delete expense splits first
      const { error: splitsError } = await supabase
        .from('expense_splits')
        .delete()
        .eq('expense_id', expense.id);

      if (splitsError) throw splitsError;

      // Delete expense items
      const { error: itemsError } = await supabase
        .from('expense_items')
        .delete()
        .eq('expense_id', expense.id);

      if (itemsError) throw itemsError;

      // Delete the expense
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expense.id);

      if (error) throw error;

      toast({ title: 'Expense deleted! ✓' });
      onDeleted();
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast({
        title: 'Failed to delete',
        description: 'Could not delete the expense. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!expense) return null;

  const isCreator = expense.created_by === user?.id;
  const isSoloBill = approvals.length === 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Delete Expense
          </DialogTitle>
          <DialogDescription>
            {isSoloBill
              ? 'This expense will be permanently deleted.'
              : 'All members involved must approve the deletion.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted rounded-xl p-4">
            <p className="font-semibold text-foreground">{expense.title}</p>
            <p className="text-lg font-bold text-coral">₹{expense.total_amount.toLocaleString()}</p>
          </div>

          {!isSoloBill && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Approval Status</p>
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-2">
                  {approvals.map((approval) => (
                    <div
                      key={approval.user_id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                    >
                      <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center text-sm">
                        {approval.avatar}
                      </div>
                      <span className="flex-1 text-sm font-medium">
                        {approval.display_name}
                        {approval.user_id === user?.id && ' (You)'}
                      </span>
                      <Badge
                        className={cn(
                          approval.approved === true
                            ? 'bg-mint/20 text-mint'
                            : approval.approved === false
                            ? 'bg-coral/20 text-coral'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {approval.approved === true ? (
                          <><Check className="w-3 h-3 mr-1" /> Approved</>
                        ) : approval.approved === false ? (
                          <><X className="w-3 h-3 mr-1" /> Declined</>
                        ) : (
                          <><Clock className="w-3 h-3 mr-1" /> Pending</>
                        )}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1 gap-2"
            onClick={handleDelete}
            disabled={isDeleting || (!isCreator && !isSoloBill)}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {isSoloBill || isCreator ? 'Delete' : 'Request Deletion'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
