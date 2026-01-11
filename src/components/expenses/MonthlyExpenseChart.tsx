import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from "recharts";
import { ChevronLeft, ChevronRight, TrendingUp, BarChart2, CalendarDays, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface MonthlyData {
  month: string;
  shortMonth: string;
  amount: number;
  year: number;
  fullDate: Date;
}

interface DailyData {
  day: string;
  date: number;
  amount: number;
  fullDate: Date;
  expenses: { title: string; amount: number; created_at: string }[];
}

interface ExpenseDetail {
  id: string;
  title: string;
  total_amount: number;
  created_at: string;
  created_by: string;
  paid_by: string;
}

type ChartView = 'monthly' | 'daily';

export const MonthlyExpenseChart = () => {
  const { user, currentRoom, isSoloMode } = useAuth();
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartView, setChartView] = useState<ChartView>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedPeriodExpenses, setSelectedPeriodExpenses] = useState<ExpenseDetail[]>([]);
  const [selectedPeriodLabel, setSelectedPeriodLabel] = useState("");

  useEffect(() => {
    if (currentRoom) {
      fetchExpenseData();
    }
  }, [currentRoom, isSoloMode, selectedMonth, chartView]);

  const fetchExpenseData = async () => {
    if (!currentRoom || !user) return;

    setIsLoading(true);
    try {
      const { data: expenses, error } = await supabase
        .from('expenses')
        .select('id, title, total_amount, created_at, created_by, paid_by')
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter for solo mode
      const filteredExpenses = isSoloMode 
        ? expenses?.filter(e => e.created_by === user.id) 
        : expenses;

      if (chartView === 'monthly') {
        // Aggregate by month (last 6 months)
        const monthlyMap = new Map<string, { amount: number; expenses: ExpenseDetail[] }>();
        const now = new Date();
        
        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyMap.set(key, { amount: 0, expenses: [] });
        }

        filteredExpenses?.forEach(expense => {
          const date = new Date(expense.created_at);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyMap.has(key)) {
            const current = monthlyMap.get(key)!;
            current.amount += expense.total_amount;
            current.expenses.push(expense);
          }
        });

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const data: MonthlyData[] = Array.from(monthlyMap.entries()).map(([key, value]) => {
          const [year, month] = key.split('-');
          return {
            month: months[parseInt(month) - 1],
            shortMonth: months[parseInt(month) - 1],
            amount: value.amount,
            year: parseInt(year),
            fullDate: new Date(parseInt(year), parseInt(month) - 1, 1),
          };
        });

        setMonthlyData(data);
      } else {
        // Aggregate by day (current month)
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const dailyMap = new Map<number, { amount: number; expenses: ExpenseDetail[] }>();
        
        // Initialize all days of the month
        for (let i = 1; i <= daysInMonth; i++) {
          dailyMap.set(i, { amount: 0, expenses: [] });
        }

        filteredExpenses?.forEach(expense => {
          const date = new Date(expense.created_at);
          if (date.getMonth() === month && date.getFullYear() === year) {
            const day = date.getDate();
            const current = dailyMap.get(day)!;
            current.amount += expense.total_amount;
            current.expenses.push(expense);
          }
        });

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const data: DailyData[] = Array.from(dailyMap.entries()).map(([date, value]) => {
          const d = new Date(year, month, date);
          return {
            day: days[d.getDay()],
            date,
            amount: value.amount,
            fullDate: d,
            expenses: value.expenses.map(e => ({ 
              title: e.title, 
              amount: e.total_amount, 
              created_at: e.created_at 
            })),
          };
        });

        setDailyData(data);
      }
    } catch (error) {
      console.error('Error fetching expense data for chart:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `₹${(value / 1000).toFixed(1)}k`;
    }
    return `₹${value}`;
  };

  const handleBarClick = async (data: any, index: number) => {
    setSelectedIndex(index);
    
    if (chartView === 'monthly') {
      const monthData = monthlyData[index];
      const year = monthData.year;
      const monthNum = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(monthData.month);
      
      // Fetch expenses for this month
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, title, total_amount, created_at, created_by, paid_by')
        .eq('room_id', currentRoom?.id)
        .gte('created_at', new Date(year, monthNum, 1).toISOString())
        .lt('created_at', new Date(year, monthNum + 1, 1).toISOString())
        .order('created_at', { ascending: false });

      const filtered = isSoloMode ? expenses?.filter(e => e.created_by === user?.id) : expenses;
      
      setSelectedPeriodExpenses(filtered || []);
      setSelectedPeriodLabel(`${monthData.month} ${year}`);
      setShowDetailSheet(true);
    } else {
      const dayData = dailyData[index];
      if (dayData.amount > 0) {
        // Fetch expenses for this day
        const startOfDay = new Date(dayData.fullDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(dayData.fullDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: expenses } = await supabase
          .from('expenses')
          .select('id, title, total_amount, created_at, created_by, paid_by')
          .eq('room_id', currentRoom?.id)
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString())
          .order('created_at', { ascending: false });

        const filtered = isSoloMode ? expenses?.filter(e => e.created_by === user?.id) : expenses;
        
        setSelectedPeriodExpenses(filtered || []);
        setSelectedPeriodLabel(`${dayData.day}, ${dayData.date} ${selectedMonth.toLocaleDateString('en-IN', { month: 'long' })}`);
        setShowDetailSheet(true);
      }
    }
  };

  const monthYearLabel = selectedMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const totalMonthly = monthlyData.reduce((sum, d) => sum + d.amount, 0);
  const totalDaily = dailyData.reduce((sum, d) => sum + d.amount, 0);

  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-2xl p-4 shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-foreground">Spending Trends</h3>
            <p className="text-xs text-muted-foreground">
              {chartView === 'monthly' 
                ? `Last 6 months • Total: ₹${totalMonthly.toLocaleString()}` 
                : `${monthYearLabel} • Total: ₹${totalDaily.toLocaleString()}`}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant={chartView === 'monthly' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setChartView('monthly')}
              title="Monthly View"
            >
              <BarChart2 className="h-4 w-4" />
            </Button>
            <Button
              variant={chartView === 'daily' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setChartView('daily')}
              title="Daily View"
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tap Hint */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <Info className="h-3 w-3" />
          <span>Tap bars to see expense details</span>
        </div>

        {/* Month Navigation for Daily View */}
        {chartView === 'daily' && (
          <div className="flex items-center justify-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => navigateMonth('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {monthYearLabel}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => navigateMonth('next')}
              disabled={selectedMonth.getMonth() === new Date().getMonth() && 
                        selectedMonth.getFullYear() === new Date().getFullYear()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            {chartView === 'monthly' ? (
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="shortMonth" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatCurrency}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Spent']}
                  cursor={{ fill: 'hsl(var(--primary) / 0.1)' }}
                />
                <Bar 
                  dataKey="amount" 
                  radius={[4, 4, 0, 0]}
                  onClick={(data, index) => handleBarClick(data, index)}
                  style={{ cursor: 'pointer' }}
                >
                  {monthlyData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={selectedIndex === index ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={6}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatCurrency}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                  labelFormatter={(value) => `Day ${value}`}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Spent']}
                  cursor={{ fill: 'hsl(var(--primary) / 0.1)' }}
                />
                <Bar 
                  dataKey="amount" 
                  radius={[4, 4, 0, 0]}
                  onClick={(data, index) => handleBarClick(data, index)}
                  style={{ cursor: 'pointer' }}
                >
                  {dailyData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.amount > 0 
                        ? (selectedIndex === index ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.7)')
                        : 'hsl(var(--muted) / 0.3)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Expense Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent side="bottom" className="h-[60vh] rounded-t-3xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {selectedPeriodLabel}
            </SheetTitle>
          </SheetHeader>
          
          <div className="space-y-3 overflow-y-auto max-h-[calc(60vh-100px)]">
            {selectedPeriodExpenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No expenses in this period
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-2 py-2 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    {selectedPeriodExpenses.length} expense{selectedPeriodExpenses.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    ₹{selectedPeriodExpenses.reduce((sum, e) => sum + e.total_amount, 0).toLocaleString()}
                  </span>
                </div>
                
                {selectedPeriodExpenses.map((expense) => (
                  <div 
                    key={expense.id} 
                    className="flex items-center justify-between p-3 bg-card rounded-xl border border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{expense.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(expense.created_at).toLocaleDateString('en-IN', { 
                          day: 'numeric', 
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <span className="text-lg font-semibold text-foreground">
                      ₹{expense.total_amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
