import { useState, useEffect } from "react";
import { Camera, Plus, TrendingUp, TrendingDown, Receipt, Users, ChevronRight, Loader2, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BillScanner } from "@/components/expenses/BillScanner";
import { ExpenseSplitter } from "@/components/expenses/ExpenseSplitter";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/empty-states/EmptyState";
import { useToast } from "@/hooks/use-toast";

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
  status: string;
  created_at: string;
  creator_profile?: {
    display_name: string;
    avatar: string;
  };
  splits?: ExpenseSplit[];
}

interface ScanResult {
  title: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
}

interface Balance {
  user_id: string;
  name: string;
  avatar: string;
  owes: number;
}

export const Expenses = () => {
  const { user, currentRoom } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "settled">("all");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showSplitter, setShowSplitter] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [updatingSplitId, setUpdatingSplitId] = useState<string | null>(null);

  // Calculate summary stats
  const [stats, setStats] = useState({ total: 0, youPaid: 0, youOwe: 0 });

  useEffect(() => {
    if (currentRoom) {
      fetchExpenses();
    }
  }, [currentRoom, activeTab]);

  const fetchExpenses = async () => {
    if (!currentRoom || !user) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('expenses')
        .select(`
          id,
          title,
          total_amount,
          created_by,
          status,
          created_at,
          expense_splits (
            id,
            user_id,
            amount,
            is_paid,
            status
          )
        `)
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: false });

      if (activeTab === 'pending') {
        query = query.eq('status', 'pending');
      } else if (activeTab === 'settled') {
        query = query.eq('status', 'settled');
      }

      const { data: expenseData, error: expenseError } = await query;
      if (expenseError) throw expenseError;

      // Fetch creator profiles
      const creatorIds = [...new Set(expenseData?.map(e => e.created_by) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', creatorIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const expensesWithProfiles = expenseData?.map(expense => ({
        ...expense,
        creator_profile: profileMap.get(expense.created_by),
        splits: expense.expense_splits,
      })) || [];

      setExpenses(expensesWithProfiles);

      // Calculate stats
      let totalSpent = 0;
      let youPaid = 0;
      let youOwe = 0;

      expensesWithProfiles.forEach(expense => {
        totalSpent += expense.total_amount;
        if (expense.created_by === user.id) {
          youPaid += expense.total_amount;
        }
        const userSplit = expense.splits?.find(s => s.user_id === user.id);
        if (userSplit && !userSplit.is_paid && userSplit.status === 'accepted') {
          youOwe += userSplit.amount;
        }
      });

      setStats({ total: totalSpent, youPaid, youOwe });

      // Calculate balances with other users
      await calculateBalances(expensesWithProfiles);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateBalances = async (expenseData: Expense[]) => {
    if (!currentRoom || !user) return;

    const { data: members } = await supabase
      .from('room_members')
      .select(`
        user_id,
        profiles:user_id (
          display_name,
          avatar
        )
      `)
      .eq('room_id', currentRoom.id)
      .neq('user_id', user.id);

    const balanceMap = new Map<string, number>();

    expenseData.forEach(expense => {
      expense.splits?.forEach(split => {
        if (split.user_id !== user.id && split.status === 'accepted') {
          // If the current user paid and this person owes
          if (expense.created_by === user.id && !split.is_paid) {
            balanceMap.set(split.user_id, (balanceMap.get(split.user_id) || 0) + split.amount);
          }
          // If this person paid and current user owes
          if (expense.created_by === split.user_id) {
            const userSplit = expense.splits?.find(s => s.user_id === user.id);
            if (userSplit && !userSplit.is_paid && userSplit.status === 'accepted') {
              balanceMap.set(split.user_id, (balanceMap.get(split.user_id) || 0) - userSplit.amount);
            }
          }
        }
      });
    });

    const balanceList = members?.map((member: any) => ({
      user_id: member.user_id,
      name: member.profiles?.display_name || 'Unknown',
      avatar: member.profiles?.avatar || '😊',
      owes: balanceMap.get(member.user_id) || 0,
    })) || [];

    setBalances(balanceList.filter(b => b.owes !== 0));
  };

  const handleScanComplete = (result: ScanResult, image: string) => {
    setScanResult(result);
    setReceiptImage(image);
    setShowSplitter(true);
  };

  const handleExpenseComplete = () => {
    setScanResult(null);
    setReceiptImage(null);
    fetchExpenses();
  };

  const handleSplitAction = async (splitId: string, action: 'accepted' | 'rejected') => {
    setUpdatingSplitId(splitId);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ status: action })
        .eq('id', splitId);

      if (error) throw error;

      toast({
        title: action === 'accepted' ? 'Expense accepted' : 'Expense rejected',
      });

      fetchExpenses();
    } catch (error) {
      console.error('Error updating split:', error);
      toast({
        title: 'Failed to update',
        variant: 'destructive',
      });
    } finally {
      setUpdatingSplitId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
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

  // Get pending expenses for current user
  const pendingForMe = expenses.filter(exp => {
    const mySplit = exp.splits?.find(s => s.user_id === user?.id);
    return mySplit && mySplit.status === 'pending' && exp.created_by !== user?.id;
  });

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header with TopBar */}
      <TopBar 
        title="Expenses" 
        showBack={true}
        onBack={() => navigate('/')}
        hint="Split bills fairly with your roommates 💰"
        rightContent={
          <Button variant="gradient" size="sm" className="gap-2 press-effect" onClick={() => setShowScanner(true)}>
            <Camera className="w-4 h-4" />
            Scan Bill
          </Button>
        }
      />

      {/* Summary Card */}
      <div className="px-4 mb-6">
        <div className="gradient-coral rounded-3xl p-5 shadow-coral">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-primary-foreground/70 text-sm">Total This Month</p>
              <p className="text-3xl font-bold text-primary-foreground font-display">
                ₹{stats.total.toLocaleString()}
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
              <Receipt className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary-foreground/10 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary-foreground/70" />
                <span className="text-xs text-primary-foreground/70">You Paid</span>
              </div>
              <p className="text-lg font-bold text-primary-foreground">
                ₹{stats.youPaid.toLocaleString()}
              </p>
            </div>
            <div className="bg-primary-foreground/10 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-primary-foreground/70" />
                <span className="text-xs text-primary-foreground/70">You Owe</span>
              </div>
              <p className="text-lg font-bold text-primary-foreground">
                ₹{stats.youOwe.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals */}
      {pendingForMe.length > 0 && (
        <section className="px-4 mb-6">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            Pending Your Approval ({pendingForMe.length})
          </h2>
          <div className="space-y-3">
            {pendingForMe.map((expense, index) => {
              const mySplit = expense.splits?.find(s => s.user_id === user?.id);
              const isUpdating = updatingSplitId === mySplit?.id;
              
              return (
                <div
                  key={expense.id}
                  className="bg-accent/10 border border-accent/30 rounded-2xl p-4 animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-xl">
                      {getCategoryEmoji(expense.title)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{expense.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {expense.creator_profile?.display_name} assigned ₹{mySplit?.amount.toFixed(0)} to you
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-10 gap-2 bg-mint hover:bg-mint/90"
                      onClick={() => mySplit && handleSplitAction(mySplit.id, 'accepted')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-10 gap-2 border-coral text-coral hover:bg-coral/10"
                      onClick={() => mySplit && handleSplitAction(mySplit.id, 'rejected')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Balances */}
      {balances.length > 0 && (
        <section className="px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-foreground">Balances</h2>
            <button className="text-sm text-primary font-medium">Settle Up</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {balances.map((person, index) => (
              <div
                key={person.user_id}
                className="flex-shrink-0 bg-card rounded-2xl p-4 shadow-card min-w-[140px] animate-scale-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="text-3xl mb-2">{person.avatar}</div>
                <p className="text-sm font-medium text-foreground">{person.name}</p>
                <p className={cn("text-sm font-bold", person.owes > 0 ? "text-coral" : "text-mint")}>
                  {person.owes > 0 ? `Owes ₹${person.owes.toFixed(0)}` : `Gets ₹${Math.abs(person.owes).toFixed(0)}`}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="px-4 mb-4">
        <div className="flex gap-2">
          {(["all", "pending", "settled"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Expense List */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState
            emoji="💸"
            title="No expenses yet!"
            description="Scan a bill or add an expense to start splitting costs with your roommates."
            actionLabel="Scan First Bill"
            onAction={() => setShowScanner(true)}
          />
        ) : (
          expenses.map((expense, index) => {
            const mySplit = expense.splits?.find(s => s.user_id === user?.id);
            
            return (
              <div
                key={expense.id}
                className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 animate-slide-up"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl">
                  {getCategoryEmoji(expense.title)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{expense.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg">{expense.creator_profile?.avatar || '😊'}</span>
                    <span className="text-xs text-muted-foreground">
                      {expense.created_by === user?.id ? 'You' : expense.creator_profile?.display_name} paid
                    </span>
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {expense.splits?.filter(s => s.status === 'accepted').length || 0}/{expense.splits?.length || 0}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">₹{expense.total_amount.toLocaleString()}</p>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    {mySplit && expense.created_by !== user?.id && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        mySplit.status === 'accepted' ? 'bg-mint/20 text-mint' :
                        mySplit.status === 'rejected' ? 'bg-coral/20 text-coral' :
                        'bg-accent/20 text-accent'
                      )}>
                        {mySplit.status === 'accepted' ? '✓' : mySplit.status === 'rejected' ? '✗' : '⏳'}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDate(expense.created_at)}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            );
          })
        )}

        <Button variant="outline" className="w-full mt-4" onClick={() => setShowScanner(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>

      {/* Bill Scanner Sheet */}
      <BillScanner
        open={showScanner}
        onOpenChange={setShowScanner}
        onScanComplete={handleScanComplete}
      />

      {/* Expense Splitter Sheet */}
      <ExpenseSplitter
        open={showSplitter}
        onOpenChange={setShowSplitter}
        scanResult={scanResult}
        receiptImage={receiptImage}
        onComplete={handleExpenseComplete}
      />

      <BottomNav activeTab="expenses" onTabChange={(tab) => {
        if (tab === 'home') navigate('/');
        else if (tab === 'tasks') navigate('/tasks');
        else if (tab === 'expenses') navigate('/expenses');
        else if (tab === 'storage') navigate('/storage');
        else if (tab === 'chat') navigate('/chat');
      }} />
    </div>
  );
};
