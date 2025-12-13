import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Wallet, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ExpenseData {
  total: number;
  pending: number;
  settled: number;
  members: { name: string; avatar: string; amount: number; color: string }[];
}

const memberColors = ['bg-primary', 'bg-coral', 'bg-mint', 'bg-lavender', 'bg-accent'];

export const ExpenseOverview = () => {
  const navigate = useNavigate();
  const { user, currentRoom } = useAuth();
  const [data, setData] = useState<ExpenseData>({ total: 0, pending: 0, settled: 0, members: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (currentRoom) {
      fetchExpenseData();
    }
  }, [currentRoom]);

  const fetchExpenseData = async () => {
    if (!currentRoom || !user) return;

    try {
      // Fetch all expenses for the room
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select(`
          id,
          total_amount,
          created_by,
          status,
          expense_splits (
            user_id,
            amount,
            is_paid,
            status
          )
        `)
        .eq('room_id', currentRoom.id);

      if (error) throw error;

      // Fetch room members with profiles
      const { data: members } = await supabase
        .from('room_members')
        .select(`
          user_id,
          profiles:user_id (
            display_name,
            avatar
          )
        `)
        .eq('room_id', currentRoom.id);

      // Calculate totals
      let total = 0;
      let pending = 0;
      let settled = 0;
      const memberAmounts = new Map<string, number>();

      expenses?.forEach(expense => {
        total += expense.total_amount;
        
        expense.expense_splits?.forEach((split: any) => {
          if (split.status === 'accepted' && !split.is_paid) {
            pending += split.amount;
          } else if (split.is_paid) {
            settled += split.amount;
          }
          
          // Track per-member contributions
          const current = memberAmounts.get(expense.created_by) || 0;
          memberAmounts.set(expense.created_by, current + expense.total_amount);
        });
      });

      // Format member data
      const memberData = members?.map((member: any, index) => ({
        name: member.user_id === user.id ? 'You' : (member.profiles?.display_name || 'Unknown'),
        avatar: member.profiles?.avatar || '😊',
        amount: memberAmounts.get(member.user_id) || 0,
        color: memberColors[index % memberColors.length],
      })) || [];

      // Sort by amount
      memberData.sort((a, b) => b.amount - a.amount);

      setData({
        total,
        pending,
        settled,
        members: memberData,
      });
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
        <h2 className="font-display text-lg font-semibold text-foreground">
          Expenses
        </h2>
        <button 
          onClick={() => navigate('/expenses')}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View All
        </button>
      </div>

      {/* Main Card */}
      <div className="gradient-primary rounded-3xl p-5 shadow-glow mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <p className="text-primary-foreground/70 text-sm">Total This Month</p>
            <p className="text-2xl font-bold text-primary-foreground font-display">
              ₹{data.total.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-primary-foreground/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-mint" />
              <span className="text-xs text-primary-foreground/70">Settled</span>
            </div>
            <p className="text-lg font-bold text-primary-foreground">
              ₹{data.settled.toLocaleString()}
            </p>
          </div>
          <div className="bg-primary-foreground/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-coral" />
              <span className="text-xs text-primary-foreground/70">Pending</span>
            </div>
            <p className="text-lg font-bold text-primary-foreground">
              ₹{data.pending.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Per User Breakdown */}
      {data.members.length > 0 && (
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <p className="text-sm font-medium text-muted-foreground mb-3">Per Roommate (Paid)</p>
          <div className="space-y-3">
            {data.members.map((member, index) => (
              <div
                key={member.name}
                className="flex items-center gap-3 animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="text-2xl">{member.avatar}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{member.name}</p>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", member.color)}
                      style={{ width: data.total > 0 ? `${(member.amount / data.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  ₹{member.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
