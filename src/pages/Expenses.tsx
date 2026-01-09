import { useState, useEffect, useCallback } from "react";
import { Camera, Plus, TrendingUp, TrendingDown, Receipt, Users, ChevronRight, Loader2, Check, X, Clock, CreditCard, FileX, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BillScanner } from "@/components/expenses/BillScanner";
import { ExpenseSplitter } from "@/components/expenses/ExpenseSplitter";
import { CreateExpenseDialog } from "@/components/expenses/CreateExpenseDialog";
import { SettleUpDialog } from "@/components/expenses/SettleUpDialog";
import { ExpenseDetailSheet } from "@/components/expenses/ExpenseDetailSheet";
import { MarkAsPaidDialog } from "@/components/expenses/MarkAsPaidDialog";
import { RejectCommentDialog } from "@/components/tasks/RejectCommentDialog";
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
  const { user, currentRoom, isSoloMode, toggleSoloMode } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "settled">("all");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showSplitter, setShowSplitter] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showSettleUp, setShowSettleUp] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [updatingSplitId, setUpdatingSplitId] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showExpenseDetail, setShowExpenseDetail] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState<Map<string, { user_id: string; display_name: string; avatar: string }>>(new Map());
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectingSplitId, setRejectingSplitId] = useState<string | null>(null);
  const [rejectingExpenseTitle, setRejectingExpenseTitle] = useState<string>('');
  const [kpiFilter, setKpiFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected' | 'settled' | null>(null);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [markingPaidSplit, setMarkingPaidSplit] = useState<{ id: string; amount: number; title: string } | null>(null);

  // Expense KPIs - Real-time updates
  const [stats, setStats] = useState({ 
    total: 0, 
    youPaid: 0, 
    youOwe: 0, 
    youAreOwed: 0,
    // Bill status KPIs
    totalBills: 0,
    pendingBills: 0,
    acceptedBills: 0,
    rejectedBills: 0,
    settledBills: 0,
  });

  const fetchExpenses = useCallback(async () => {
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
          paid_by,
          status,
          created_at,
          expense_splits (
            id,
            user_id,
            amount,
            is_paid,
            status,
            rejection_comment
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

      // Fetch creator and payer profiles
      const userIds = [...new Set([
        ...(expenseData?.map(e => e.created_by) || []),
        ...(expenseData?.map(e => e.paid_by) || [])
      ])];
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const expensesWithProfiles = expenseData?.map(expense => ({
        ...expense,
        creator_profile: profileMap.get(expense.created_by),
        payer_profile: profileMap.get(expense.paid_by),
        splits: expense.expense_splits,
      })) || [];

      setExpenses(expensesWithProfiles);

      // Calculate stats from ALL expenses (not filtered)
      const { data: allExpenses } = await supabase
        .from('expenses')
        .select(`
          id,
          total_amount,
          created_by,
          paid_by,
          status,
          expense_splits (
            id,
            user_id,
            amount,
            is_paid,
            status
          )
        `)
        .eq('room_id', currentRoom.id);

      let totalSpent = 0;
      let youPaid = 0;
      let youOwe = 0;
      let youAreOwed = 0;
      
      // Bill status counters
      let pendingBills = 0;
      let acceptedBills = 0;
      let rejectedBills = 0;
      let settledBills = 0;

      allExpenses?.forEach(expense => {
        totalSpent += expense.total_amount;
        
        if (expense.paid_by === user.id) {
          youPaid += expense.total_amount;
          // Calculate how much others owe you from this expense
          expense.expense_splits?.forEach((split: any) => {
            if (split.user_id !== user.id && !split.is_paid && split.status === 'accepted') {
              youAreOwed += split.amount;
            }
          });
        }
        
        const userSplit = expense.expense_splits?.find((s: any) => s.user_id === user.id);
        if (userSplit && !userSplit.is_paid && userSplit.status === 'accepted' && expense.paid_by !== user.id) {
          youOwe += userSplit.amount;
        }

        // Count bill statuses
        if (expense.status === 'settled') {
          settledBills++;
        } else {
          // Check splits for this expense
          const splits = expense.expense_splits || [];
          const hasRejected = splits.some((s: any) => s.status === 'rejected');
          const allAccepted = splits.every((s: any) => s.status === 'accepted' || s.is_paid);
          const hasPending = splits.some((s: any) => s.status === 'pending');

          if (hasRejected) {
            rejectedBills++;
          } else if (allAccepted && splits.length > 0) {
            acceptedBills++;
          } else if (hasPending) {
            pendingBills++;
          }
        }
      });

      setStats({ 
        total: totalSpent, 
        youPaid, 
        youOwe, 
        youAreOwed,
        totalBills: allExpenses?.length || 0,
        pendingBills,
        acceptedBills,
        rejectedBills,
        settledBills,
      });

      // Calculate balances with other users
      await calculateBalances(allExpenses || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentRoom, user, activeTab]);

  useEffect(() => {
    if (currentRoom) {
      fetchExpenses();
      
      // Subscribe to realtime updates for instant KPI refresh
      const channel = supabase
        .channel('expenses-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'expenses', filter: `room_id=eq.${currentRoom.id}` },
          () => fetchExpenses()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'expense_splits' },
          () => fetchExpenses()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentRoom, activeTab, fetchExpenses]);

  const calculateBalances = async (expenseData: any[]) => {
    if (!currentRoom || !user) return;

    // Fetch all room members including current user for profiles
    const { data: allMembers } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', currentRoom.id);

    const allMemberIds = allMembers?.map(m => m.user_id) || [];
    
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar')
      .in('user_id', allMemberIds);

    // Store profiles for use in expense detail sheet
    const profileMap = new Map<string, { user_id: string; display_name: string; avatar: string }>();
    profilesData?.forEach(p => profileMap.set(p.user_id, p));
    setMemberProfiles(profileMap);

    const balanceMap = new Map<string, number>();

    expenseData.forEach(expense => {
      expense.expense_splits?.forEach((split: any) => {
        if (split.status === 'accepted') {
          // If the current user paid and this person owes
          if (expense.paid_by === user.id && split.user_id !== user.id && !split.is_paid) {
            balanceMap.set(split.user_id, (balanceMap.get(split.user_id) || 0) + split.amount);
          }
          // If this person paid and current user owes
          if (expense.paid_by === split.user_id && split.user_id !== user.id) {
            const userSplit = expense.expense_splits?.find((s: any) => s.user_id === user.id);
            if (userSplit && !userSplit.is_paid && userSplit.status === 'accepted') {
              balanceMap.set(split.user_id, (balanceMap.get(split.user_id) || 0) - userSplit.amount);
            }
          }
        }
      });
    });

    const balanceList = profilesData?.filter(p => p.user_id !== user.id).map(member => ({
      user_id: member.user_id,
      name: member.display_name || 'Unknown',
      avatar: member.avatar || '😊',
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
    
    // Show success and offer to view the created expense
    toast({
      title: 'Expense created! 🎉',
      description: 'Your expense has been saved and split.',
    });
  };

  // Accept split (no comment needed)
  const handleSplitAccept = async (splitId: string) => {
    setUpdatingSplitId(splitId);
    try {
      const { error } = await supabase
        .from('expense_splits')
        .update({ status: 'accepted' })
        .eq('id', splitId);

      if (error) throw error;

      toast({
        title: 'Expense accepted',
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

  // Open rejection dialog (mandatory comment)
  const handleRejectClick = (splitId: string, expenseTitle: string) => {
    setRejectingSplitId(splitId);
    setRejectingExpenseTitle(expenseTitle);
    setShowRejectDialog(true);
  };

  // Confirm rejection with comment
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

    toast({ title: 'Expense rejected' });
    setRejectingSplitId(null);
    setRejectingExpenseTitle('');
    fetchExpenses();
  };

  const handlePayment = async (split: ExpenseSplit, expense: Expense) => {
    // Create UPI payment URL
    const payerProfile = expense.payer_profile;
    const amount = split.amount.toFixed(2);
    const note = encodeURIComponent(`Payment for: ${expense.title}`);
    
    // Generic UPI intent - works with most UPI apps
    const upiUrl = `upi://pay?pa=&pn=${encodeURIComponent(payerProfile?.display_name || 'Roommate')}&am=${amount}&cu=INR&tn=${note}`;
    
    // Open UPI app
    window.open(upiUrl, '_blank');
    
    toast({
      title: 'Opening payment app...',
      description: 'Complete the payment in your UPI app, then mark as paid here.',
    });
  };

  const markAsPaid = async (splitId: string, amount: number, title: string) => {
    // Open confirmation dialog instead of directly marking
    setMarkingPaidSplit({ id: splitId, amount, title });
    setShowMarkPaidDialog(true);
  };

  const handleMarkPaidConfirmed = () => {
    fetchExpenses();
    setMarkingPaidSplit(null);
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

  // Get pending expenses for current user (only from others, not self-created)
  const pendingForMe = expenses.filter(exp => {
    if (isSoloMode) return false; // No pending approvals in solo mode
    const mySplit = exp.splits?.find(s => s.user_id === user?.id);
    return mySplit && mySplit.status === 'pending' && exp.created_by !== user?.id;
  });

  // Get my unpaid splits that need payment
  const unpaidSplits = expenses.filter(exp => {
    if (isSoloMode) return false; // No unpaid splits in solo mode
    const mySplit = exp.splits?.find(s => s.user_id === user?.id);
    return mySplit && mySplit.status === 'accepted' && !mySplit.is_paid && exp.paid_by !== user?.id;
  });

  // Filter expenses based on KPI filter
  const filteredExpenses = expenses.filter(exp => {
    if (!kpiFilter || kpiFilter === 'all') return true;
    
    if (kpiFilter === 'settled') return exp.status === 'settled';
    
    const splits = exp.splits || [];
    const hasRejected = splits.some(s => s.status === 'rejected');
    const allAccepted = splits.every(s => s.status === 'accepted' || s.is_paid);
    const hasPending = splits.some(s => s.status === 'pending');
    
    if (kpiFilter === 'rejected') return hasRejected;
    if (kpiFilter === 'accepted') return allAccepted && splits.length > 0 && exp.status !== 'settled';
    if (kpiFilter === 'pending') return hasPending && !hasRejected;
    
    return true;
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2 press-effect" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4" />
              Add
            </Button>
            <Button variant="gradient" size="sm" className="gap-2 press-effect" onClick={() => setShowScanner(true)}>
              <Camera className="w-4 h-4" />
              Scan
            </Button>
          </div>
        }
      />

      {/* Summary Card with Bill KPIs */}
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

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-primary-foreground/10 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-primary-foreground/70" />
                <span className="text-xs text-primary-foreground/70">Paid</span>
              </div>
              <p className="text-base font-bold text-primary-foreground">
                ₹{stats.youPaid.toLocaleString()}
              </p>
            </div>
            <div className="bg-primary-foreground/10 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingDown className="w-3 h-3 text-primary-foreground/70" />
                <span className="text-xs text-primary-foreground/70">You Owe</span>
              </div>
              <p className="text-base font-bold text-primary-foreground">
                ₹{stats.youOwe.toLocaleString()}
              </p>
            </div>
            <div className="bg-primary-foreground/10 rounded-xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-primary-foreground/70" />
                <span className="text-xs text-primary-foreground/70">Owed</span>
              </div>
              <p className="text-base font-bold text-primary-foreground">
                ₹{stats.youAreOwed.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Bill Status KPIs - Clickable for filtering */}
          <div className="grid grid-cols-5 gap-1 pt-3 border-t border-primary-foreground/20">
            {[
              { key: 'all' as const, label: 'Total', value: stats.totalBills },
              { key: 'pending' as const, label: 'Pending', value: stats.pendingBills },
              { key: 'accepted' as const, label: 'Accepted', value: stats.acceptedBills },
              { key: 'rejected' as const, label: 'Rejected', value: stats.rejectedBills },
              { key: 'settled' as const, label: 'Settled', value: stats.settledBills },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setKpiFilter(kpiFilter === item.key ? null : item.key)}
                className={cn(
                  "text-center p-1 rounded-lg transition-all",
                  kpiFilter === item.key 
                    ? "bg-primary-foreground/30 ring-2 ring-primary-foreground" 
                    : "hover:bg-primary-foreground/10"
                )}
              >
                <p className="text-lg font-bold text-primary-foreground">{item.value}</p>
                <p className="text-[10px] text-primary-foreground/70">{item.label}</p>
              </button>
            ))}
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
                      onClick={() => mySplit && handleSplitAccept(mySplit.id)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-10 gap-2 border-coral text-coral hover:bg-coral/10"
                      onClick={() => mySplit && handleRejectClick(mySplit.id, expense.title)}
                      disabled={isUpdating}
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Unpaid - Need to Pay */}
      {unpaidSplits.length > 0 && (
        <section className="px-4 mb-6">
          <h2 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-coral" />
            You Need to Pay ({unpaidSplits.length})
          </h2>
          <div className="space-y-3">
            {unpaidSplits.map((expense, index) => {
              const mySplit = expense.splits?.find(s => s.user_id === user?.id);
              const isUpdating = updatingSplitId === mySplit?.id;
              
              return (
                <div
                  key={expense.id}
                  className="bg-coral/10 border border-coral/30 rounded-2xl p-4 animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-coral/20 flex items-center justify-center text-xl">
                      {getCategoryEmoji(expense.title)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{expense.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Pay ₹{mySplit?.amount.toFixed(0)} to {expense.payer_profile?.display_name}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-coral">₹{mySplit?.amount.toFixed(0)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-10 gap-2"
                      onClick={() => mySplit && handlePayment(mySplit, expense)}
                    >
                      <CreditCard className="w-4 h-4" />
                      Pay via UPI
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-10 gap-2"
                      onClick={() => mySplit && markAsPaid(mySplit.id, mySplit.amount, expense.title)}
                    >
                      <Check className="w-4 h-4" />
                      Mark Paid
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
            <button className="text-sm text-primary font-medium press-effect" onClick={() => setShowSettleUp(true)}>Settle Up</button>
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
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            emoji="💸"
            title={kpiFilter ? `No ${kpiFilter} expenses` : "No expenses yet!"}
            description={kpiFilter ? `No expenses match the "${kpiFilter}" filter.` : "Scan a bill or add an expense to start splitting costs with your roommates."}
            actionLabel={kpiFilter ? "Clear Filter" : "Scan First Bill"}
            onAction={() => kpiFilter ? setKpiFilter(null) : setShowScanner(true)}
          />
        ) : (
          filteredExpenses.map((expense, index) => {
            const mySplit = expense.splits?.find(s => s.user_id === user?.id);
            
            return (
              <button
                key={expense.id}
                onClick={() => {
                  setSelectedExpense(expense);
                  setShowExpenseDetail(true);
                }}
                className="w-full bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 animate-slide-up text-left hover:bg-muted/50 transition-colors press-effect"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl">
                  {getCategoryEmoji(expense.title)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{expense.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg">{expense.payer_profile?.avatar || '😊'}</span>
                    <span className="text-xs text-muted-foreground">
                      {expense.paid_by === user?.id ? 'You' : expense.payer_profile?.display_name} paid
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
                    {mySplit && expense.paid_by !== user?.id && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        mySplit.is_paid ? 'bg-mint/20 text-mint' :
                        mySplit.status === 'accepted' ? 'bg-coral/20 text-coral' :
                        mySplit.status === 'rejected' ? 'bg-muted text-muted-foreground' :
                        'bg-accent/20 text-accent'
                      )}>
                        {mySplit.is_paid ? '✓ Paid' : mySplit.status === 'accepted' ? '₹' + mySplit.amount.toFixed(0) : mySplit.status === 'rejected' ? '✗' : '⏳'}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDate(expense.created_at)}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            );
          })
        )}

        <Button variant="outline" className="w-full mt-4" onClick={() => setShowCreateDialog(true)}>
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

      {/* Create Expense Dialog */}
      <CreateExpenseDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onComplete={handleExpenseComplete}
      />

      {/* Settle Up Dialog */}
      <SettleUpDialog
        open={showSettleUp}
        onOpenChange={setShowSettleUp}
        balances={balances}
        onComplete={handleExpenseComplete}
      />

      {/* Expense Detail Sheet */}
      <ExpenseDetailSheet
        open={showExpenseDetail}
        onOpenChange={setShowExpenseDetail}
        expense={selectedExpense}
        memberProfiles={memberProfiles}
        onUpdate={fetchExpenses}
      />

      {/* Reject Comment Dialog */}
      <RejectCommentDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onConfirm={handleRejectConfirm}
        title="Reject Expense"
        description={`Please provide a reason for rejecting "${rejectingExpenseTitle}".`}
      />

      {/* Mark as Paid Confirmation Dialog */}
      {markingPaidSplit && (
        <MarkAsPaidDialog
          open={showMarkPaidDialog}
          onOpenChange={setShowMarkPaidDialog}
          splitId={markingPaidSplit.id}
          amount={markingPaidSplit.amount}
          expenseTitle={markingPaidSplit.title}
          onComplete={handleMarkPaidConfirmed}
        />
      )}

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
