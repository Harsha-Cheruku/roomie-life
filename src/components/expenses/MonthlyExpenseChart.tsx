import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { ChevronLeft, ChevronRight, TrendingUp, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface MonthlyData {
  month: string;
  shortMonth: string;
  amount: number;
  year: number;
}

interface DailyData {
  day: string;
  date: number;
  amount: number;
}

type ChartView = 'monthly' | 'daily';

export const MonthlyExpenseChart = () => {
  const { user, currentRoom, isSoloMode } = useAuth();
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartView, setChartView] = useState<ChartView>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date());

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
        .select('total_amount, created_at, created_by')
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter for solo mode
      const filteredExpenses = isSoloMode 
        ? expenses?.filter(e => e.created_by === user.id) 
        : expenses;

      if (chartView === 'monthly') {
        // Aggregate by month (last 6 months)
        const monthlyMap = new Map<string, number>();
        const now = new Date();
        
        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyMap.set(key, 0);
        }

        filteredExpenses?.forEach(expense => {
          const date = new Date(expense.created_at);
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyMap.has(key)) {
            monthlyMap.set(key, (monthlyMap.get(key) || 0) + expense.total_amount);
          }
        });

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const data: MonthlyData[] = Array.from(monthlyMap.entries()).map(([key, amount]) => {
          const [year, month] = key.split('-');
          return {
            month: months[parseInt(month) - 1],
            shortMonth: months[parseInt(month) - 1],
            amount,
            year: parseInt(year),
          };
        });

        setMonthlyData(data);
      } else {
        // Aggregate by day (current month)
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const dailyMap = new Map<number, number>();
        
        // Initialize all days of the month
        for (let i = 1; i <= daysInMonth; i++) {
          dailyMap.set(i, 0);
        }

        filteredExpenses?.forEach(expense => {
          const date = new Date(expense.created_at);
          if (date.getMonth() === month && date.getFullYear() === year) {
            const day = date.getDate();
            dailyMap.set(day, (dailyMap.get(day) || 0) + expense.total_amount);
          }
        });

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const data: DailyData[] = Array.from(dailyMap.entries()).map(([date, amount]) => {
          const d = new Date(year, month, date);
          return {
            day: days[d.getDay()],
            date,
            amount,
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
          >
            <BarChart2 className="h-4 w-4" />
          </Button>
          <Button
            variant={chartView === 'daily' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setChartView('daily')}
          >
            <TrendingUp className="h-4 w-4" />
          </Button>
        </div>
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
              />
              <Bar 
                dataKey="amount" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          ) : (
            <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              />
              <Line 
                type="monotone" 
                dataKey="amount" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
