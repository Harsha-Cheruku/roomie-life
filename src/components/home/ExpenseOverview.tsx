import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Wallet, Loader2, ArrowUpCircle, ArrowDownCircle, Calendar } from "lucide-react";
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

export const ExpenseOverview = () => {
  const navigate = useNavigate();
  const { user, currentRoom, isSoloMode } = useAuth();
  const [data, setData] = useState<ExpenseData>({ total: 0, pending: 0, settled: 0, willPay: 0, willGet: 0, todaySpending: 0, members: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentRoom) {
      fetchExpenseData();
      
      const channel = supabase
        .channel('expense-overview-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `room_id=eq.${currentRoom.id}` }, () => fetchExpenseData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' }, () => fetchExpenseData())
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [currentRoom]);

  const fetchExpenseData = async () => {
    if (!currentRoom || !user) return;

    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select(`id, total_amount, created_by, status, created_at, expense_splits (user_id, amount, is_paid, status)`)
        .eq('room_id', currentRoom.id);

      if (error) throw error;

      const { data: roomMembers } = await supabase.from('room_members').select('user_id').eq('room_id', currentRoom.id);
      const memberUserIds = roomMembers?.map((m: any) => m.user_id) || [];
      const { data: profilesData } = await supabase.from('profiles').select('user_id, display_name, avatar').in('user_id', memberUserIds);

      const profileMap = new Map((profilesData || []).map((p: any) => [p.user_id, p]));
      const members = roomMembers?.map((m: any) => ({ user_id: m.user_id, profiles: profileMap.get(m.user_id) || null })) || [];

      let total = 0, pending = 0, settled = 0, willPay = 0, willGet = 0, todaySpending = 0;
      const memberAmounts = new Map<string, number>();
      const today = new Date().toDateString();

      expenses?.forEach((expense: any) => {
        if (isSoloMode && expense.created_by !== user?.id) return;
        total += expense.total_amount;
        if (expense.created_at) {
          const expenseDate = new Date(expense.created_at).toDateString();
          if (expenseDate === today) todaySpending += expense.total_amount;
        }
        expense.expense_splits?.forEach((split: any) => {
          if (split.status === 'accepted' && !split.is_paid) {
            pending += split.amount;
            if (split.user_id === user?.id) willPay += split.amount;
            else if (expense.created_by === user?.id) willGet += split.amount;
          } else if (split.is_paid) {
            settled += split.amount;
          }
          const current = memberAmounts.get(expense.created_by) || 0;
          memberAmounts.set(expense.created_by, current + expense.total_amount);
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
      <button onClick={() => navigate('/expenses')} className="w-full text-left gradient-primary rounded-3xl p-5 shadow-glow mb-4 hover:opacity-95 transition-opacity press-effect">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <p className="text-primary-foreground/70 text-sm">Total This Month</p>
            <p className="text-2xl font-bold text-primary-foreground font-display">₹{data.total.toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-primary-foreground/10 rounded-2xl p-2.5 min-w-0">
            <div className="flex items-center gap-1 mb-1">
              <ArrowUpCircle className="w-3.5 h-3.5 text-coral shrink-0" />
              <span className="text-[10px] text-primary-foreground/70 truncate">Will Pay</span>
            </div>
            <p className="text-sm font-bold text-primary-foreground truncate">₹{data.willPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-2xl p-2.5 min-w-0">
            <div className="flex items-center gap-1 mb-1">
              <ArrowDownCircle className="w-3.5 h-3.5 text-mint shrink-0" />
              <span className="text-[10px] text-primary-foreground/70 truncate">Will Get</span>
            </div>
            <p className="text-sm font-bold text-primary-foreground truncate">₹{data.willGet.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-primary-foreground/10 rounded-2xl p-2.5 min-w-0">
            <div className="flex items-center gap-1 mb-1">
              <Calendar className="w-3.5 h-3.5 text-lavender shrink-0" />
              <span className="text-[10px] text-primary-foreground/70 truncate">Today</span>
            </div>
            <p className="text-sm font-bold text-primary-foreground truncate">₹{data.todaySpending.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </button>

      {/* Per User Breakdown - clickable */}
      {data.members.length > 0 && (
        <button onClick={() => navigate('/expenses')} className="w-full text-left bg-card rounded-2xl p-4 shadow-card press-effect hover:shadow-lg transition-shadow">
          <p className="text-sm font-medium text-muted-foreground mb-3">Per Roommate (Paid)</p>
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
                <p className="text-sm font-semibold text-foreground">₹{member.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </button>
      )}
    </section>
  );
};
