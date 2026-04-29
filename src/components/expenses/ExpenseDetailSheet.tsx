import { useState, useEffect } from 'react';
import { Check, CreditCard, Loader2, X, Receipt, Users, ArrowLeft, Download, Edit2, Trash2, RefreshCw, ListOrdered, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { RejectCommentDialog } from '@/components/tasks/RejectCommentDialog';
import { EditExpenseDialog } from '@/components/expenses/EditExpenseDialog';
import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog';
import { useCreateNotification } from '@/hooks/useCreateNotification';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

interface ExpenseSplit {
  id: string;
  user_id: string;
  amount: number;
  is_paid: boolean;
  status: string;
  rejection_comment?: string | null;
}

interface Expense {
  id: string;
  title: string;
  total_amount: number;
  created_by: string;
  paid_by: string;
  status: string;
  created_at: string;
  category?: string;
  notes?: string;
  receipt_url?: string;
  creator_profile?: {
    display_name: string;
    avatar: string;
  };
  payer_profile?: {
    display_name: string;
    avatar: string;
  };
  splits?: ExpenseSplit[];
}

interface MemberProfile {
  user_id: string;
  display_name: string;
  avatar: string;
}

interface ExpenseDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: Expense | null;
  memberProfiles: Map<string, MemberProfile>;
  onUpdate: () => void;
}

interface ExpenseItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export const ExpenseDetailSheet = ({
  open,
  onOpenChange,
  expense,
  memberProfiles,
  onUpdate,
}: ExpenseDetailSheetProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { createExpenseAcceptedNotification, createExpenseRejectedNotification, createExpensePaidNotification } = useCreateNotification();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingSplitId, setRejectingSplitId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Load itemized breakdown whenever a new expense opens
  useEffect(() => {
    if (!open || !expense?.id) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoadingItems(true);
    supabase
      .from('expense_items')
      .select('id, name, price, quantity')
      .eq('expense_id', expense.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Failed to load items:', error);
        setItems((data as ExpenseItem[]) || []);
        setLoadingItems(false);
      });
    return () => { cancelled = true; };
  }, [open, expense?.id]);

  if (!expense) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryEmoji = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('grocery') || lower.includes('groceries')) return '🛒';
    if (lower.includes('netflix') || lower.includes('subscription')) return '📺';
    if (lower.includes('electric')) return '⚡';
    if (lower.includes('internet') || lower.includes('wifi')) return '📶';
    if (lower.includes('pizza') || lower.includes('food') || lower.includes('restaurant')) return '🍕';
    if (lower.includes('rent')) return '🏠';
    if (lower.includes('water')) return '💧';
    return '📝';
  };

  const handlePayment = (split: ExpenseSplit) => {
    const payerProfile = expense.payer_profile;
    const amount = split.amount.toFixed(2);
    const note = encodeURIComponent(`Payment for: ${expense.title}`);
    
    const upiUrl = `upi://pay?pn=${encodeURIComponent(payerProfile?.display_name || 'Roommate')}&am=${amount}&cu=INR&tn=${note}`;
    
    const link = document.createElement('a');
    link.href = upiUrl;
    link.click();
    
    toast({
      title: 'Opening payment app...',
      description: 'Complete the payment in your UPI app, then mark as paid here.',
    });
  };

  const markAsPaid = async (splitId: string, amount: number) => {
    setUpdatingId(splitId);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ is_paid: true })
        .eq('id', splitId);

      if (error) throw error;

      // Create notification for the person who originally paid
      const userName = profile?.display_name || 'Someone';
      await createExpensePaidNotification(
        { id: expense.id, title: expense.title, paid_by: expense.paid_by },
        userName,
        amount
      );

      toast({ title: 'Marked as paid! ✓' });
      onUpdate();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAccept = async (splitId: string) => {
    setUpdatingId(splitId);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ status: 'accepted' })
        .eq('id', splitId);

      if (error) throw error;

      // Create notification for expense creator
      const userName = profile?.display_name || 'Someone';
      await createExpenseAcceptedNotification(
        { id: expense.id, title: expense.title, created_by: expense.created_by },
        userName
      );

      toast({ title: 'Expense accepted' });
      onUpdate();
    } catch (error) {
      console.error('Error updating split:', error);
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRejectClick = (splitId: string) => {
    setRejectingSplitId(splitId);
    setShowRejectDialog(true);
  };

  const handleRejectConfirm = async (comment: string) => {
    if (!rejectingSplitId) return;

    const { error } = await supabase
      .from('expense_splits')
      .update({ 
        status: 'rejected',
        rejection_comment: comment 
      })
      .eq('id', rejectingSplitId);

    if (error) throw error;

    // Create notification for expense creator
    const userName = profile?.display_name || 'Someone';
    await createExpenseRejectedNotification(
      { id: expense.id, title: expense.title, created_by: expense.created_by },
      userName,
      comment
    );

    toast({ title: 'Expense rejected' });
    setRejectingSplitId(null);
    onUpdate();
  };

  const mySplit = expense.splits?.find(s => s.user_id === user?.id);
  const isPayer = expense.paid_by === user?.id;
  const isCreator = expense.created_by === user?.id;
  
  // Check if bill is fully paid/settled - should be read-only
  const isSettled = expense.status === 'settled';
  const allSplitsPaid = expense.splits?.every(s => s.is_paid || s.status === 'rejected') ?? false;
  const isReadOnly = isSettled || allSplitsPaid;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl overflow-hidden flex flex-col">
          <SheetHeader className="shrink-0 flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <SheetTitle className="text-xl font-bold">Expense Details</SheetTitle>
            </div>
            {isCreator && !isReadOnly && (
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-primary"
                  onClick={() => setShowEditDialog(true)}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-coral"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
            {isCreator && isReadOnly && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                🔒 Read-only
              </span>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pb-4">
            {/* Header Card */}
            <div className="bg-card rounded-2xl p-5 shadow-card">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-3xl">
                  {getCategoryEmoji(expense.title)}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-foreground">{expense.title}</h2>
                  <p className="text-sm text-muted-foreground">{formatDate(expense.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">₹{expense.total_amount.toLocaleString()}</p>
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    expense.status === 'settled' ? 'bg-mint/20 text-mint' : 'bg-accent/20 text-accent'
                  )}>
                    {expense.status === 'settled' ? '✓ Settled' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {/* Itemized breakdown */}
            {(loadingItems || items.length > 0) && (
              <div className="bg-card rounded-2xl p-4 shadow-card">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-primary" />
                  Items ({items.length})
                </h3>
                {loadingItems ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading items...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((it) => {
                      const itemTotal = it.price * it.quantity;
                      // Dedupe by user_id to avoid showing the same person multiple times
                      const seenUsers = new Set<string>();
                      const participants = (expense.splits || [])
                        .filter(s => s.status !== 'rejected')
                        .filter(s => {
                          if (seenUsers.has(s.user_id)) return false;
                          seenUsers.add(s.user_id);
                          return true;
                        });
                      const perPerson = participants.length > 0 ? itemTotal / participants.length : 0;
                      const isExpanded = expandedItemId === it.id;
                      return (
                        <div key={it.id} className="border-b border-border last:border-0 pb-2 last:pb-0">
                          <button
                            type="button"
                            onClick={() => setExpandedItemId(isExpanded ? null : it.id)}
                            className="w-full flex items-center justify-between gap-2 text-left"
                          >
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <ChevronDown
                                className={cn(
                                  "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                                  isExpanded && "rotate-180"
                                )}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{it.name}</p>
                                {it.quantity > 1 && (
                                  <p className="text-xs text-muted-foreground">Qty: {it.quantity} × ₹{it.price.toFixed(2)}</p>
                                )}
                              </div>
                            </div>
                            <p className="text-sm font-semibold text-foreground shrink-0">₹{itemTotal.toFixed(2)}</p>
                          </button>
                          {isExpanded && (
                            <div className="mt-2 ml-6 bg-muted/40 rounded-lg p-2 space-y-1.5">
                              <div className="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border">
                                <span>Split across {participants.length} {participants.length === 1 ? 'person' : 'people'}</span>
                                <span className="font-semibold text-primary">₹{perPerson.toFixed(2)} each</span>
                              </div>
                              {participants.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No active participants.</p>
                              ) : (
                                participants.map(s => {
                                  const p = memberProfiles.get(s.user_id);
                                  const isMe = s.user_id === user?.id;
                                  return (
                                    <div key={s.id} className="flex items-center gap-2">
                                      <ProfileAvatar avatar={p?.avatar} size="sm" />
                                      <p className="flex-1 text-xs font-medium text-foreground truncate">
                                        {isMe ? 'You' : p?.display_name || 'Unknown'}
                                      </p>
                                      <p className="text-xs font-semibold text-foreground">₹{perPerson.toFixed(2)}</p>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                      <p className="text-sm font-semibold text-foreground">Total</p>
                      <p className="text-sm font-bold text-primary">
                        ₹{items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Your share is split equally below across {expense.splits?.length || 0} {(expense.splits?.length || 0) === 1 ? 'person' : 'people'}.
                </p>
              </div>
            )}

            {/* Paid By */}
            <div className="bg-card rounded-2xl p-4 shadow-card">
              <div className="flex items-center gap-3">
                <ProfileAvatar avatar={expense.payer_profile?.avatar} size="lg" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Paid by</p>
                  <p className="font-semibold text-foreground">
                    {isPayer ? 'You' : expense.payer_profile?.display_name || 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-mint">₹{expense.total_amount.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Split Details */}
            <div className="bg-card rounded-2xl p-4 shadow-card">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Split Between ({expense.splits?.length || 0})
              </h3>
              <div className="space-y-3">
                {expense.splits?.map(split => {
                  const splitProfile = memberProfiles.get(split.user_id);
                  const isMe = split.user_id === user?.id;
                  const isUpdating = updatingId === split.id;
                  const needsAction = isMe && split.status === 'pending' && !isCreator && expense.paid_by !== user?.id;
                  const needsPayment = isMe && split.status === 'accepted' && !split.is_paid && expense.paid_by !== user?.id;

                  return (
                    <div key={split.id} className="border border-border rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar avatar={splitProfile?.avatar} size="md" />
                        <div className="flex-1">
                          <p className="font-medium text-foreground">
                            {isMe ? 'You' : splitProfile?.display_name || 'Unknown'}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full",
                              split.is_paid ? 'bg-mint/20 text-mint' :
                              split.status === 'accepted' ? 'bg-accent/20 text-accent' :
                              split.status === 'rejected' ? 'bg-muted text-muted-foreground' :
                              'bg-coral/20 text-coral'
                            )}>
                              {split.is_paid ? '✓ Paid' : 
                               split.status === 'accepted' ? 'Accepted' : 
                               split.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-foreground">₹{split.amount.toFixed(2)}</p>
                        </div>
                      </div>

                      {split.status === 'rejected' && split.rejection_comment && (
                        <div className="mt-2 p-2 bg-coral/10 rounded-lg">
                          <p className="text-xs text-coral font-medium">Rejection reason:</p>
                          <p className="text-xs text-foreground">{split.rejection_comment}</p>
                          {isCreator && !isReadOnly && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 text-xs gap-1 border-primary text-primary hover:bg-primary/10"
                              onClick={async () => {
                                setUpdatingId(split.id);
                                try {
                                  const { error } = await supabase
                                    .from('expense_splits')
                                    .update({ status: 'pending', rejection_comment: null })
                                    .eq('id', split.id);
                                  if (error) throw error;
                                  toast({ title: 'Bill resent for approval' });
                                  onUpdate();
                                } catch (err) {
                                  toast({ title: 'Failed to resend', variant: 'destructive' });
                                } finally {
                                  setUpdatingId(null);
                                }
                              }}
                              disabled={updatingId === split.id}
                            >
                              {updatingId === split.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Resend Bill
                            </Button>
                          )}
                        </div>
                      )}

                      {needsAction && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                          <Button
                            className="flex-1 h-9 gap-2 bg-mint hover:bg-mint/90"
                            onClick={() => handleAccept(split.id)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 h-9 gap-2 border-coral text-coral hover:bg-coral/10"
                            onClick={() => handleRejectClick(split.id)}
                            disabled={isUpdating}
                          >
                            <X className="w-4 h-4" />
                            Reject
                          </Button>
                        </div>
                      )}

                      {needsPayment && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                          <Button
                            className="flex-1 h-9 gap-2"
                            onClick={() => handlePayment(split)}
                          >
                            <CreditCard className="w-4 h-4" />
                            Pay via UPI
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 h-9 gap-2"
                            onClick={() => markAsPaid(split.id, split.amount)}
                            disabled={isUpdating}
                          >
                            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Mark Paid
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {expense.receipt_url && (
              <div className="bg-card rounded-2xl p-4 shadow-card">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" />
                  Receipt
                </h3>
                <div className="rounded-xl overflow-hidden bg-muted">
                  <img 
                    src={expense.receipt_url} 
                    alt="Receipt" 
                    className="w-full h-auto max-h-64 object-contain"
                  />
                </div>
                <Button variant="outline" className="w-full mt-3 gap-2" asChild>
                  <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer">
                    <Download className="w-4 h-4" />
                    View Full Receipt
                  </a>
                </Button>
              </div>
            )}

            {expense.notes && (
              <div className="bg-card rounded-2xl p-4 shadow-card">
                <h3 className="font-semibold text-foreground mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground">{expense.notes}</p>
              </div>
            )}

            {isReadOnly && (
              <div className="bg-mint/10 rounded-2xl p-4 text-center">
                <p className="text-sm text-mint font-medium">✓ This bill is settled and locked</p>
                <p className="text-xs text-muted-foreground mt-1">Settled bills cannot be edited or deleted</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <RejectCommentDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onConfirm={handleRejectConfirm}
        title="Reject Expense Split"
        description={`Please provide a reason for rejecting this expense split for "${expense.title}".`}
      />

      <EditExpenseDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        expense={expense}
        onComplete={() => {
          onUpdate();
        }}
      />

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Expense"
        description="This will permanently delete this expense and all associated splits. This action cannot be undone."
        itemName={expense.title}
        isLoading={isDeleting}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await supabase.from('expense_splits').delete().eq('expense_id', expense.id);
            const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
            if (error) throw error;
            toast({ title: 'Expense deleted' });
            onOpenChange(false);
            onUpdate();
          } catch (error) {
            console.error('Error deleting expense:', error);
            toast({ title: 'Failed to delete', variant: 'destructive' });
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    </>
  );
};
