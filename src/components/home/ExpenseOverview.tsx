import { useState, useEffect } from "react";
import { Wallet, Loader2, ArrowUpCircle, ArrowDownCircle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

interface ExpenseData {
  total: number;
  pending: number;
  settled: number;
  willPay: number;
  willGet: number;
  todaySpending: number;
  members: { name: string; avatar: string; amount: number; color: string }[];
}

const memberColors = ['bg-primary', 'bg-coral', 'bg-mint', 'bg-lavender', 'bg-accent'];

const formatAmount = (amount: number) => amount.toLocaleString('en-IN', {
  minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  maximumFractionDigits: 2,
});

export const ExpenseOverview = ({ pendingExpenseCount = 0 }: { pendingExpenseCount?: number }) => {
  const navigate = useNavigate();
  const { user, currentRoom, isSoloMode } = useAuth();
  const [data, setData] = useState<ExpenseData>({ total: 0, pending: 0, settled: 0, willPay: 0, willGet: 0, todaySpending: 0, members: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentRoom && user) {
      fetchExpenseData();

      // Debounce + scope realtime to reduce lag on home dashboard
      let timer: ReturnType<typeof setTimeout> | null = null;
      const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          fetchExpenseData();
          timer = null;
        }, 300);
      };
      const channel = supabase
        .channel(`expense-overview-${currentRoom.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `room_id=eq.${currentRoom.id}` }, schedule)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' }, schedule)
        .subscribe();

      return () => {
        if (timer) clearTimeout(timer);
        supabase.removeChannel(channel);
      };
    }
  }, [currentRoom, user, isSoloMode]);

  const fetchExpenseData = async () => {
    if (!currentRoom || !user) return;

    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select(`id, total_amount, created_by, status, created_at, expense_splits (user_id, amount, is_paid, status)`)
        .eq('room_id', currentRoom.id);

      if (error) throw error;

      const isPersonalSoloExpense = (expense: any) =>
        expense.created_by === user.id &&
        expense.paid_by === user.id &&
        (!(expense.expense_splits?.length) || expense.expense_splits.every((split: any) => split.user_id === user.id));

      const visibleExpenses = (expenses || []).filter((expense: any) => !isSoloMode || isPersonalSoloExpense(expense));

      const { data: roomMembers } = await supabase.from('room_members').select('user_id').eq('room_id', currentRoom.id);
      const memberUserIds = isSoloMode
        ? [user.id]
        : (roomMembers?.map((m: any) => m.user_id) || []);
      const { data: profilesData } = await supabase.from('profiles').select('user_id, display_name, avatar').in('user_id', memberUserIds);

      const profileMap = new Map((profilesData || []).map((p: any) => [p.user_id, p]));
      const members = roomMembers?.map((m: any) => ({ user_id: m.user_id, profiles: profileMap.get(m.user_id) || null })) || [];

      let total = 0, pending = 0, settled = 0, willPay = 0, willGet = 0, todaySpending = 0;
      const memberAmounts = new Map<string, number>();
      const today = new Date().toDateString();

      visibleExpenses.forEach((expense: any) => {
        total += expense.total_amount;
        if (expense.created_at) {
          const expenseDate = new Date(expense.created_at).toDateString();
          if (expenseDate === today) todaySpending += expense.total_amount;
        }

        const payerId = expense.paid_by || expense.created_by;
        memberAmounts.set(payerId, (memberAmounts.get(payerId) || 0) + expense.total_amount);

        expense.expense_splits?.forEach((split: any) => {
          if (isSoloMode) return;
          if (split.status === 'accepted' && !split.is_paid) {
            pending += split.amount;
            if (split.user_id === user?.id) willPay += split.amount;
            else if (expense.created_by === user?.id) willGet += split.amount;
          } else if (split.is_paid) {
            settled += split.amount;
          }
        });
      });

      const memberData = members?.map((member: any, index) => ({
        name: member.user_id === user.id ? 'You' : (member.profiles?.display_name || 'Unknown'),
        avatar: member.profiles?.avatar || '😊',
        amount: memberAmounts.get(member.user_id) || 0,
        color: memberColors[index % memberColors.length],
      })) || [];

      memberData.sort((a, b) => b.amount - a.amount);
      setData({ total, pending, settled, willPay, willGet, todaySpending, members: memberData });
    } catch (error) {
      console.error('Error fetching expense data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <section className="px-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Expenses</h2>
        <button onClick={() => navigate('/expenses')} className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">View All</button>
      </div>

      {/* Main Card - clickable */}
      <button onClick={() => navigate('/expenses')} className="w-full text-left gradient-primary rounded-3xl p-4 shadow-glow mb-4 hover:opacity-95 transition-opacity press-effect sm:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative w-12 h-12 rounded-2xl bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Wallet className="w-6 h-6 text-primary-foreground" />
            {pendingExpenseCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/70" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-primary-foreground bg-destructive" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-primary-foreground/70 text-sm">Total This Month</p>
            <p className="font-bold text-primary-foreground font-display leading-none break-all text-[clamp(1.75rem,8vw,2.5rem)]">₹{formatAmount(data.total)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-primary-foreground/10 rounded-2xl p-3 min-w-0 overflow-hidden">
            <div className="flex items-start gap-2 mb-2 min-w-0">
              <ArrowUpCircle className="w-4 h-4 text-coral shrink-0 mt-0.5" />
              <span className="text-xs text-primary-foreground/70 leading-tight">Will Pay</span>
            </div>
            <p className="text-base font-bold text-primary-foreground leading-tight break-all">₹{formatAmount(data.willPay)}</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-2xl p-3 min-w-0 overflow-hidden">
            <div className="flex items-start gap-2 mb-2 min-w-0">
              <ArrowDownCircle className="w-4 h-4 text-mint shrink-0 mt-0.5" />
              <span className="text-xs text-primary-foreground/70 leading-tight">Will Get</span>
            </div>
            <p className="text-base font-bold text-primary-foreground leading-tight break-all">₹{formatAmount(data.willGet)}</p>
          </div>
          <div className="col-span-2 bg-primary-foreground/10 rounded-2xl p-3 min-w-0 overflow-hidden">
            <div className="flex items-start gap-2 mb-2 min-w-0">
              <Calendar className="w-4 h-4 text-lavender shrink-0 mt-0.5" />
              <span className="text-xs text-primary-foreground/70 leading-tight">Today</span>
            </div>
            <p className="text-base font-bold text-primary-foreground leading-tight break-all">₹{formatAmount(data.todaySpending)}</p>
          </div>
        </div>
      </button>

      {/* Per User Breakdown - clickable */}
      {data.members.length > 0 && (
        <button onClick={() => navigate('/expenses')} className="w-full text-left bg-card rounded-2xl p-4 shadow-card press-effect hover:shadow-lg transition-shadow">
          <p className="text-sm font-medium text-muted-foreground mb-3">{isSoloMode ? 'Your spending' : 'Per Roommate (Paid)'}</p>
          <div className="space-y-3">
            {data.members.map((member, index) => (
              <div key={member.name} className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                <ProfileAvatar avatar={member.avatar} size="md" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{member.name}</p>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                    <div className={cn("h-full rounded-full transition-all duration-500", member.color)} style={{ width: data.total > 0 ? `${(member.amount / data.total) * 100}%` : '0%' }} />
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground">₹{formatAmount(member.amount)}</p>
              </div>
            ))}
          </div>
        </button>
      )}
    </section>
  );
};
