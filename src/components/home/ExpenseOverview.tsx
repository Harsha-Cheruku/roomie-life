import { useState, useEffect } from "react";
import { Wallet, Loader2, ArrowUpCircle, ArrowDownCircle, Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MemberRow {
  user_id: string;
  name: string;
  avatar: string;
  amount: number;
  color: string;
}

interface BillBreakdownItem {
  expense_id: string;
  title: string;
  amount: number;
  date: string;
}

interface ExpenseData {
  total: number;
  pending: number;
  settled: number;
  willPay: number;
  willGet: number;
  todaySpending: number;
  members: MemberRow[];
  willPayPerMember: MemberRow[];
  willGetPerMember: MemberRow[];
  willPayBills: Map<string, BillBreakdownItem[]>;
  willGetBills: Map<string, BillBreakdownItem[]>;
}

const memberColors = ['bg-primary', 'bg-coral', 'bg-mint', 'bg-lavender', 'bg-accent'];

const formatAmount = (amount: number) => amount.toLocaleString('en-IN', {
  minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  maximumFractionDigits: 2,
});

export const ExpenseOverview = ({ pendingExpenseCount = 0 }: { pendingExpenseCount?: number }) => {
  const navigate = useNavigate();
  const { user, currentRoom, isSoloMode } = useAuth();
  const currency = useCurrency();
  const [data, setData] = useState<ExpenseData>({
    total: 0, pending: 0, settled: 0, willPay: 0, willGet: 0, todaySpending: 0,
    members: [], willPayPerMember: [], willGetPerMember: [],
    willPayBills: new Map(), willGetBills: new Map(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [breakdownMode, setBreakdownMode] = useState<'paid' | 'willPay' | 'willGet'>('paid');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (currentRoom && user) {
      fetchExpenseData();

      let timer: ReturnType<typeof setTimeout> | null = null;
      const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { fetchExpenseData(); timer = null; }, 300);
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
        .select(`id, total_amount, paid_by, created_by, status, created_at, expense_splits (user_id, amount, is_paid, status)`)
        .eq('room_id', currentRoom.id);

      if (error) throw error;

      const isPersonalSoloExpense = (expense: any) =>
        expense.created_by === user.id &&
        expense.paid_by === user.id &&
        (!(expense.expense_splits?.length) || expense.expense_splits.every((split: any) => split.user_id === user.id));

      const visibleExpenses = (expenses || []).filter((expense: any) => !isSoloMode || isPersonalSoloExpense(expense));

      const { data: roomMembers } = await supabase.from('room_members').select('user_id').eq('room_id', currentRoom.id);
      const memberUserIds = isSoloMode ? [user.id] : (roomMembers?.map((m: any) => m.user_id) || []);
      const { data: profilesData } = await supabase.from('profiles').select('user_id, display_name, avatar').in('user_id', memberUserIds);

      const profileMap = new Map((profilesData || []).map((p: any) => [p.user_id, p]));
      const members = (isSoloMode ? [{ user_id: user.id }] : (roomMembers || []))
        .map((m: any) => ({ user_id: m.user_id, profiles: profileMap.get(m.user_id) || null }));

      let total = 0, pending = 0, settled = 0, willPay = 0, willGet = 0, todaySpending = 0;
      const memberAmounts = new Map<string, number>();
      const willPayPerUser = new Map<string, number>();
      const willGetPerUser = new Map<string, number>();
      const willPayBills = new Map<string, BillBreakdownItem[]>();
      const willGetBills = new Map<string, BillBreakdownItem[]>();
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
            if (split.user_id === user.id && payerId !== user.id) {
              willPay += split.amount;
              willPayPerUser.set(payerId, (willPayPerUser.get(payerId) || 0) + split.amount);
              const bucket = willPayBills.get(payerId) || [];
              bucket.push({ expense_id: expense.id, title: expense.title || 'Bill', amount: split.amount, date: expense.created_at });
              willPayBills.set(payerId, bucket);
            } else if (payerId === user.id && split.user_id !== user.id) {
              willGet += split.amount;
              willGetPerUser.set(split.user_id, (willGetPerUser.get(split.user_id) || 0) + split.amount);
              const bucket = willGetBills.get(split.user_id) || [];
              bucket.push({ expense_id: expense.id, title: expense.title || 'Bill', amount: split.amount, date: expense.created_at });
              willGetBills.set(split.user_id, bucket);
            }
          } else if (split.is_paid) {
            settled += split.amount;
          }
        });
      });

      const buildRows = (amounts: Map<string, number>): MemberRow[] => {
        const rows = members.map((m: any, index: number) => ({
          user_id: m.user_id,
          name: m.user_id === user.id ? 'You' : (m.profiles?.display_name || 'Unknown'),
          avatar: m.profiles?.avatar || '😊',
          amount: amounts.get(m.user_id) || 0,
          color: memberColors[index % memberColors.length],
        }));
        return rows.sort((a, b) => b.amount - a.amount);
      };

      setData({
        total, pending, settled, willPay, willGet, todaySpending,
        members: buildRows(memberAmounts),
        willPayPerMember: buildRows(willPayPerUser).filter((r) => r.amount > 0),
        willGetPerMember: buildRows(willGetPerUser).filter((r) => r.amount > 0),
        willPayBills,
        willGetBills,
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

  const breakdownRows =
    breakdownMode === 'willPay' ? data.willPayPerMember :
    breakdownMode === 'willGet' ? data.willGetPerMember :
    data.members;

  const breakdownTotal =
    breakdownMode === 'willPay' ? data.willPay :
    breakdownMode === 'willGet' ? data.willGet :
    data.total;

  const breakdownLabel =
    breakdownMode === 'willPay' ? 'You will pay (per roommate)' :
    breakdownMode === 'willGet' ? 'You will receive (per roommate)' :
    (isSoloMode ? 'Your spending' : 'Per Roommate (Paid)');

  const modeOptions: { value: 'paid' | 'willPay' | 'willGet'; label: string }[] = [
    { value: 'paid', label: isSoloMode ? 'Your spending' : 'Paid by roommate' },
    { value: 'willPay', label: 'You will pay' },
    { value: 'willGet', label: 'You will receive' },
  ];

  // Net balance per person: positive = they owe you, negative = you owe them
  const netByUser = new Map<string, { name: string; avatar: string; net: number; color: string }>();
  data.willPayPerMember.forEach((m, i) => {
    netByUser.set(m.user_id, { name: m.name, avatar: m.avatar, net: -m.amount, color: m.color });
  });
  data.willGetPerMember.forEach((m, i) => {
    const existing = netByUser.get(m.user_id);
    if (existing) {
      existing.net += m.amount;
    } else {
      netByUser.set(m.user_id, { name: m.name, avatar: m.avatar, net: m.amount, color: m.color });
    }
  });
  const netRows = Array.from(netByUser.entries())
    .map(([user_id, v]) => ({ user_id, ...v }))
    .filter((r) => Math.abs(r.net) > 0.005)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  const netTotal = data.willGet - data.willPay;
  const maxNetAbs = netRows.reduce((max, r) => Math.max(max, Math.abs(r.net)), 0);

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
            <p className="font-bold text-primary-foreground font-display leading-none break-all text-[clamp(1.75rem,8vw,2.5rem)]">{currency}{formatAmount(data.total)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setBreakdownMode((m) => m === 'willPay' ? 'paid' : 'willPay'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setBreakdownMode((m) => m === 'willPay' ? 'paid' : 'willPay'); } }}
            className={cn(
              'rounded-2xl p-3 min-w-0 overflow-hidden cursor-pointer transition-all',
              breakdownMode === 'willPay' ? 'bg-primary-foreground/25 ring-2 ring-primary-foreground/60' : 'bg-primary-foreground/10 hover:bg-primary-foreground/15'
            )}
          >
            <div className="flex items-start gap-2 mb-2 min-w-0">
              <ArrowUpCircle className="w-4 h-4 text-coral shrink-0 mt-0.5" />
              <span className="text-xs text-primary-foreground/70 leading-tight">Will Pay</span>
            </div>
            <p className="text-base font-bold text-primary-foreground leading-tight break-all">{currency}{formatAmount(data.willPay)}</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setBreakdownMode((m) => m === 'willGet' ? 'paid' : 'willGet'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setBreakdownMode((m) => m === 'willGet' ? 'paid' : 'willGet'); } }}
            className={cn(
              'rounded-2xl p-3 min-w-0 overflow-hidden cursor-pointer transition-all',
              breakdownMode === 'willGet' ? 'bg-primary-foreground/25 ring-2 ring-primary-foreground/60' : 'bg-primary-foreground/10 hover:bg-primary-foreground/15'
            )}
          >
            <div className="flex items-start gap-2 mb-2 min-w-0">
              <ArrowDownCircle className="w-4 h-4 text-mint shrink-0 mt-0.5" />
              <span className="text-xs text-primary-foreground/70 leading-tight">Will Get</span>
            </div>
            <p className="text-base font-bold text-primary-foreground leading-tight break-all">{currency}{formatAmount(data.willGet)}</p>
          </div>
          <div className="col-span-2 bg-primary-foreground/10 rounded-2xl p-3 min-w-0 overflow-hidden">
            <div className="flex items-start gap-2 mb-2 min-w-0">
              <Calendar className="w-4 h-4 text-lavender shrink-0 mt-0.5" />
              <span className="text-xs text-primary-foreground/70 leading-tight">Today</span>
            </div>
            <p className="text-base font-bold text-primary-foreground leading-tight break-all">{currency}{formatAmount(data.todaySpending)}</p>
          </div>
        </div>
      </button>

      {/* You pay / You get — Net Balance Summary */}
      {!isSoloMode && netRows.length > 0 && (
        <div className="bg-card rounded-2xl p-4 shadow-card mb-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="text-sm font-semibold text-foreground">Net Balance</p>
            <p className={cn(
              "text-sm font-bold whitespace-nowrap",
              netTotal > 0 ? 'text-mint' : netTotal < 0 ? 'text-coral' : 'text-muted-foreground'
            )}>
              {netTotal > 0 ? `You get ${currency}${formatAmount(netTotal)}` :
               netTotal < 0 ? `You pay ${currency}${formatAmount(Math.abs(netTotal))}` :
               'All settled'}
            </p>
          </div>
          <div className="space-y-3">
            {netRows.map((r, idx) => {
              const isOwedToYou = r.net > 0;
              const widthPct = maxNetAbs > 0 ? (Math.abs(r.net) / maxNetAbs) * 100 : 0;
              return (
                <button
                  key={r.user_id}
                  type="button"
                  onClick={() => navigate('/expenses')}
                  className="w-full flex items-center gap-3 text-left press-effect animate-slide-up"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <ProfileAvatar avatar={r.avatar} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                      <p className={cn(
                        "text-xs font-medium whitespace-nowrap",
                        isOwedToYou ? 'text-mint' : 'text-coral'
                      )}>
                        {isOwedToYou ? 'owes you' : 'you owe'}
                      </p>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isOwedToYou ? 'bg-mint' : 'bg-coral'
                        )}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                  <p className={cn(
                    "text-sm font-semibold whitespace-nowrap",
                    isOwedToYou ? 'text-mint' : 'text-coral'
                  )}>
                    {isOwedToYou ? '+' : '-'}{currency}{formatAmount(Math.abs(r.net))}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Per User Breakdown - clickable */}
      {breakdownRows.length > 0 ? (
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-muted-foreground truncate">{breakdownLabel}</p>
            <Select value={breakdownMode} onValueChange={(v) => setBreakdownMode(v as 'paid' | 'willPay' | 'willGet')}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={cn("space-y-3", breakdownRows.length > 5 && "max-h-96 overflow-y-auto pr-1")}>
            {breakdownRows.map((member, index) => {
              const isExpandable = breakdownMode !== 'paid';
              const billsForMember = breakdownMode === 'willPay'
                ? data.willPayBills.get(member.user_id) || []
                : breakdownMode === 'willGet'
                  ? data.willGetBills.get(member.user_id) || []
                  : [];
              const isOpen = isExpandable && expandedUserId === member.user_id;
              return (
                <div key={`${member.user_id}-${index}`} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isExpandable) {
                        setExpandedUserId(isOpen ? null : member.user_id);
                      } else {
                        navigate('/expenses');
                      }
                    }}
                    className="w-full flex items-center gap-3 text-left press-effect"
                  >
                    <ProfileAvatar avatar={member.avatar} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                        {isExpandable && billsForMember.length > 0 && (
                          <span className="text-[10px] text-muted-foreground shrink-0">({billsForMember.length})</span>
                        )}
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                        <div className={cn("h-full rounded-full transition-all duration-500", member.color)} style={{ width: breakdownTotal > 0 ? `${(member.amount / breakdownTotal) * 100}%` : '0%' }} />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-foreground whitespace-nowrap">{currency}{formatAmount(member.amount)}</p>
                    {isExpandable && (
                      <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-90")} />
                    )}
                  </button>
                  {isOpen && billsForMember.length > 0 && (
                    <div className="mt-2 ml-12 pl-3 border-l-2 border-border space-y-1.5">
                      {billsForMember.map((bill) => (
                        <button
                          key={bill.expense_id}
                          type="button"
                          onClick={() => navigate('/expenses')}
                          className="w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{bill.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={cn(
                                "text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                                breakdownMode === 'willPay'
                                  ? 'bg-coral/15 text-coral'
                                  : 'bg-mint/15 text-mint'
                              )}>
                                {breakdownMode === 'willPay' ? 'You have to pay' : 'You will receive'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(bill.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          <p className={cn("text-xs font-semibold whitespace-nowrap", breakdownMode === 'willPay' ? 'text-coral' : 'text-mint')}>
                            {breakdownMode === 'willPay' ? '-' : '+'}{currency}{formatAmount(bill.amount)}
                          </p>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => navigate('/expenses')}
                        className="w-full text-[11px] text-primary font-medium pt-1 text-left hover:underline"
                      >
                        View & manage in Expenses →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : breakdownMode !== 'paid' ? (
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-medium text-muted-foreground truncate">{breakdownLabel}</p>
            <Select value={breakdownMode} onValueChange={(v) => setBreakdownMode(v as 'paid' | 'willPay' | 'willGet')}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground text-center py-2">
            {breakdownMode === 'willPay' ? 'You don\u2019t owe anyone right now.' : 'No one owes you right now.'}
          </p>
        </div>
      ) : null}
    </section>
  );
};
