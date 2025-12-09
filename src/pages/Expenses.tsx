import { useState, useEffect } from "react";
import { Camera, Plus, TrendingUp, TrendingDown, Receipt, Users, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BillScanner } from "@/components/expenses/BillScanner";
import { ExpenseSplitter } from "@/components/expenses/ExpenseSplitter";

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
  splits?: {
    user_id: string;
    amount: number;
    is_paid: boolean;
  }[];
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
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "settled">("all");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showSplitter, setShowSplitter] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

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
            user_id,
            amount,
            is_paid
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
        if (userSplit && !userSplit.is_paid) {
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
        if (split.user_id !== user.id) {
          // If the current user paid and this person owes
          if (expense.created_by === user.id && !split.is_paid) {
            balanceMap.set(split.user_id, (balanceMap.get(split.user_id) || 0) + split.amount);
          }
          // If this person paid and current user owes
          if (expense.created_by === split.user_id) {
            const userSplit = expense.splits?.find(s => s.user_id === user.id);
            if (userSplit && !userSplit.is_paid) {
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

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl font-bold text-foreground">Expenses</h1>
          <Button variant="gradient" size="sm" className="gap-2" onClick={() => setShowScanner(true)}>
            <Camera className="w-4 h-4" />
            Scan Bill
          </Button>
        </div>

        {/* Summary Card */}
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
      </header>

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
          <div className="text-center py-12">
            <Receipt className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No expenses yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Scan a bill to get started!</p>
          </div>
        ) : (
          expenses.map((expense, index) => (
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
                    {expense.splits?.length || 0}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">₹{expense.total_amount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{formatDate(expense.created_at)}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          ))
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
    </div>
  );
};
