import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateNotification } from '@/hooks/useCreateNotification';

interface ExpenseAcceptRejectProps {
  splitId: string;
  expenseId: string;
  expenseTitle: string;
  expenseCreatedBy: string;
  amount: number;
  status: string;
  onStatusChange: () => void;
}

export const ExpenseAcceptReject = ({ 
  splitId,
  expenseId,
  expenseTitle, 
  expenseCreatedBy,
  amount, 
  status,
  onStatusChange 
}: ExpenseAcceptRejectProps) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { createExpenseAcceptedNotification, createExpenseRejectedNotification } = useCreateNotification();
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (newStatus: 'accepted' | 'rejected') => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ status: newStatus })
        .eq('id', splitId);

      if (error) throw error;

      // Create notification for expense creator
      const userName = profile?.display_name || 'Someone';
      const expense = { id: expenseId, title: expenseTitle, created_by: expenseCreatedBy };
      
      if (newStatus === 'accepted') {
        await createExpenseAcceptedNotification(expense, userName);
      } else {
        await createExpenseRejectedNotification(expense, userName);
      }

      toast({
        title: newStatus === 'accepted' ? 'Expense accepted' : 'Expense rejected',
        description: newStatus === 'accepted' 
          ? `You accepted ₹${amount.toFixed(0)} for "${expenseTitle}"`
          : `You rejected the expense for "${expenseTitle}"`,
      });

      onStatusChange();
    } catch (error) {
      console.error('Error updating expense status:', error);
      toast({
        title: 'Failed to update',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (status !== 'pending') {
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${
        status === 'accepted' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'
      }`}>
        {status === 'accepted' ? 'Accepted' : 'Rejected'}
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 rounded-lg border-mint text-mint hover:bg-mint/10"
        onClick={() => handleAction('accepted')}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 rounded-lg border-coral text-coral hover:bg-coral/10"
        onClick={() => handleAction('rejected')}
        disabled={isLoading}
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
      </Button>
    </div>
  );
};
