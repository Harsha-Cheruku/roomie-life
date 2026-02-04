import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Users, Receipt, ChevronRight, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SettledExpense {
  id: string;
  title: string;
  total_amount: number;
  created_at: string;
  paid_by: string;
  payer_profile?: {
    display_name: string;
    avatar: string;
  };
  splits_count: number;
}

interface SettledBillsSectionProps {
  onExpenseClick?: (expense: SettledExpense) => void;
}

export const SettledBillsSection = ({ onExpenseClick }: SettledBillsSectionProps) => {
  const { currentRoom, user } = useAuth();
  const [expenses, setExpenses] = useState<SettledExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentRoom) {
      fetchSettledExpenses();
    }
  }, [currentRoom]);

  const fetchSettledExpenses = async () => {
    if (!currentRoom) return;

    setIsLoading(true);
    try {
      const { data: expenseData, error } = await supabase
        .from('expenses')
        .select(`
          id,
          title,
          total_amount,
          created_at,
          paid_by,
          expense_splits (id)
        `)
        .eq('room_id', currentRoom.id)
        .eq('status', 'settled')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Fetch payer profiles
      const payerIds = [...new Set(expenseData?.map(e => e.paid_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', payerIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const expensesWithProfiles = expenseData?.map(expense => ({
        id: expense.id,
        title: expense.title,
        total_amount: expense.total_amount,
        created_at: expense.created_at,
        paid_by: expense.paid_by,
        payer_profile: profileMap.get(expense.paid_by),
        splits_count: expense.expense_splits?.length || 0,
      })) || [];

      setExpenses(expensesWithProfiles);
    } catch (error) {
      console.error('Error fetching settled expenses:', error);
    } finally {
      setIsLoading(false);
    }
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Check className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No settled bills yet</p>
          <p className="text-sm text-muted-foreground">Bills will appear here once all members have paid</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Check className="w-5 h-5 text-mint" />
          Settled Bills
          <Badge variant="secondary" className="ml-auto">{expenses.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-border">
            {expenses.map((expense) => (
              <button
                key={expense.id}
                onClick={() => onExpenseClick?.(expense)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-mint/10 flex items-center justify-center text-xl">
                  {getCategoryEmoji(expense.title)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-foreground">{expense.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg">{expense.payer_profile?.avatar || '😊'}</span>
                    <span className="text-xs text-muted-foreground">
                      {expense.payer_profile?.display_name || 'Unknown'} paid
                    </span>
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{expense.splits_count}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-mint">₹{expense.total_amount.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(expense.created_at), 'MMM d')}
                  </div>
                </div>
                <Badge className="bg-mint/20 text-mint">
                  <Check className="w-3 h-3 mr-1" />
                  Settled
                </Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
