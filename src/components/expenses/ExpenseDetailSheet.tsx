import { useState } from 'react';
import { Check, CreditCard, Loader2, X, Receipt, Users, ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ExpenseSplit {
  id: string;
  user_id: string;
  amount: number;
  is_paid: boolean;
  status: string;
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

export const ExpenseDetailSheet = ({
  open,
  onOpenChange,
  expense,
  memberProfiles,
  onUpdate,
}: ExpenseDetailSheetProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
    
    const upiUrl = `upi://pay?pa=&pn=${encodeURIComponent(payerProfile?.display_name || 'Roommate')}&am=${amount}&cu=INR&tn=${note}`;
    window.open(upiUrl, '_blank');
    
    toast({
      title: 'Opening payment app...',
      description: 'Complete the payment in your UPI app, then mark as paid here.',
    });
  };

  const markAsPaid = async (splitId: string) => {
    setUpdatingId(splitId);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ is_paid: true })
        .eq('id', splitId);

      if (error) throw error;

      toast({ title: 'Marked as paid! ✓' });
      onUpdate();
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSplitAction = async (splitId: string, action: 'accepted' | 'rejected') => {
    setUpdatingId(splitId);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ status: action })
        .eq('id', splitId);

      if (error) throw error;

      toast({ title: action === 'accepted' ? 'Expense accepted' : 'Expense rejected' });
      onUpdate();
    } catch (error) {
      console.error('Error updating split:', error);
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const mySplit = expense.splits?.find(s => s.user_id === user?.id);
  const isPayer = expense.paid_by === user?.id;
  const isCreator = expense.created_by === user?.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0 flex flex-row items-center gap-3 pb-2">
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <SheetTitle className="text-xl font-bold">Expense Details</SheetTitle>
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

          {/* Paid By */}
          <div className="bg-card rounded-2xl p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-mint/20 flex items-center justify-center text-2xl">
                {expense.payer_profile?.avatar || '😊'}
              </div>
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
                const profile = memberProfiles.get(split.user_id);
                const isMe = split.user_id === user?.id;
                const isUpdating = updatingId === split.id;
                const needsAction = isMe && split.status === 'pending' && !isCreator && expense.paid_by !== user?.id;
                const needsPayment = isMe && split.status === 'accepted' && !split.is_paid && expense.paid_by !== user?.id;

                return (
                  <div key={split.id} className="border border-border rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                        {profile?.avatar || '😊'}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {isMe ? 'You' : profile?.display_name || 'Unknown'}
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
                        <p className="font-bold text-foreground">₹{split.amount.toFixed(0)}</p>
                      </div>
                    </div>

                    {/* Action buttons for pending approval */}
                    {needsAction && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                        <Button
                          className="flex-1 h-9 gap-2 bg-mint hover:bg-mint/90"
                          onClick={() => handleSplitAction(split.id, 'accepted')}
                          disabled={isUpdating}
                        >
                          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 h-9 gap-2 border-coral text-coral hover:bg-coral/10"
                          onClick={() => handleSplitAction(split.id, 'rejected')}
                          disabled={isUpdating}
                        >
                          {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                          Reject
                        </Button>
                      </div>
                    )}

                    {/* Payment buttons */}
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
                          onClick={() => markAsPaid(split.id)}
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

          {/* Receipt Image */}
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

          {/* Notes */}
          {expense.notes && (
            <div className="bg-card rounded-2xl p-4 shadow-card">
              <h3 className="font-semibold text-foreground mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground">{expense.notes}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
