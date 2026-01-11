import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  due_date: string | null;
  assignee_profile?: {
    display_name: string;
    avatar: string;
  };
}

interface TaskDashboardProps {
  tasks: Task[];
}

const STATUS_COLORS = {
  pending: "hsl(var(--muted-foreground))",
  accepted: "hsl(var(--primary))",
  in_progress: "hsl(var(--accent))",
  done: "hsl(142, 71%, 45%)", // mint/green
  rejected: "hsl(var(--destructive))",
};

const PRIORITY_COLORS = {
  low: "hsl(142, 71%, 45%)", // mint
  medium: "hsl(var(--accent))",
  high: "hsl(var(--destructive))",
};

export const TaskDashboard = ({ tasks }: TaskDashboardProps) => {
  const [selectedData, setSelectedData] = useState<{ type: string; label: string; tasks: Task[] } | null>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);

  // Status distribution data
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      accepted: 0,
      in_progress: 0,
      done: 0,
      rejected: 0,
    };
    tasks.forEach(task => {
      if (counts[task.status] !== undefined) {
        counts[task.status]++;
      }
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([status, count]) => ({
        name: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value: count,
        status,
        color: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "hsl(var(--muted))",
      }));
  }, [tasks]);

  // Priority distribution data
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0 };
    tasks.forEach(task => {
      if (counts[task.priority] !== undefined) {
        counts[task.priority]++;
      }
    });
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([priority, count]) => ({
        name: priority.charAt(0).toUpperCase() + priority.slice(1),
        value: count,
        priority,
        color: PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] || "hsl(var(--muted))",
      }));
  }, [tasks]);

  // Monthly task creation data (last 6 months)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months = eachMonthOfInterval({
      start: subMonths(startOfMonth(now), 5),
      end: endOfMonth(now),
    });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthTasks = tasks.filter(task => {
        const createdAt = new Date(task.created_at);
        return createdAt >= monthStart && createdAt <= monthEnd;
      });

      const completed = monthTasks.filter(t => t.status === 'done').length;
      const pending = monthTasks.filter(t => t.status !== 'done' && t.status !== 'rejected').length;

      return {
        month: format(month, 'MMM'),
        fullMonth: format(month, 'MMMM yyyy'),
        completed,
        pending,
        total: monthTasks.length,
        monthStart,
        monthEnd,
      };
    });
  }, [tasks]);

  const handlePieClick = (data: any, type: 'status' | 'priority') => {
    let filteredTasks: Task[];
    let label: string;

    if (type === 'status') {
      filteredTasks = tasks.filter(t => t.status === data.status);
      label = `${data.name} Tasks`;
    } else {
      filteredTasks = tasks.filter(t => t.priority === data.priority);
      label = `${data.name} Priority Tasks`;
    }

    setSelectedData({ type, label, tasks: filteredTasks });
    setShowDetailSheet(true);
  };

  const handleBarClick = (data: any) => {
    if (!data || !data.monthStart) return;
    
    const filteredTasks = tasks.filter(task => {
      const createdAt = new Date(task.created_at);
      return createdAt >= data.monthStart && createdAt <= data.monthEnd;
    });

    setSelectedData({ type: 'month', label: `Tasks in ${data.fullMonth}`, tasks: filteredTasks });
    setShowDetailSheet(true);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
          <p className="text-sm font-medium">{payload[0].payload.name || payload[0].payload.month}</p>
          <p className="text-xs text-muted-foreground">
            {payload[0].value} tasks
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Status Pie Chart */}
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <h4 className="text-sm font-medium text-muted-foreground mb-2 text-center">By Status</h4>
          {statusData.length > 0 ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(data) => handlePieClick(data, 'status')}
                    className="cursor-pointer"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              No data
            </div>
          )}
          <div className="flex flex-wrap gap-1 justify-center mt-2">
            {statusData.slice(0, 3).map((item) => (
              <div 
                key={item.status} 
                className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                onClick={() => handlePieClick(item, 'status')}
              >
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[10px] text-muted-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Priority Pie Chart */}
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <h4 className="text-sm font-medium text-muted-foreground mb-2 text-center">By Priority</h4>
          {priorityData.length > 0 ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={45}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(data) => handlePieClick(data, 'priority')}
                    className="cursor-pointer"
                  >
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              No data
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {priorityData.map((item) => (
              <div 
                key={item.priority} 
                className="flex items-center gap-1 cursor-pointer hover:opacity-80"
                onClick={() => handlePieClick(item, 'priority')}
              >
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[10px] text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Bar Chart */}
      <div className="bg-card rounded-2xl p-4 shadow-card">
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Monthly Overview</h4>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={monthlyData}
              onClick={(data) => data?.activePayload && handleBarClick(data.activePayload[0]?.payload)}
            >
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={25}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
                        <p className="text-sm font-medium">{data.fullMonth}</p>
                        <p className="text-xs text-mint">Completed: {data.completed}</p>
                        <p className="text-xs text-primary">Pending: {data.pending}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="completed" 
                stackId="a" 
                fill="hsl(142, 71%, 45%)" 
                radius={[0, 0, 0, 0]}
                className="cursor-pointer"
              />
              <Bar 
                dataKey="pending" 
                stackId="a" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
                className="cursor-pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(142, 71%, 45%)' }} />
            <span className="text-xs text-muted-foreground">Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(var(--primary))' }} />
            <span className="text-xs text-muted-foreground">Pending</span>
          </div>
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent side="bottom" className="h-[60vh] rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{selectedData?.label}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3 overflow-y-auto max-h-[calc(60vh-100px)]">
            {selectedData?.tasks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No tasks found</p>
            ) : (
              selectedData?.tasks.map((task) => (
                <div 
                  key={task.id} 
                  className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                    {task.assignee_profile?.avatar || '😊'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium text-sm truncate",
                      task.status === 'done' && "line-through text-muted-foreground"
                    )}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        task.priority === 'high' && "bg-destructive/20 text-destructive",
                        task.priority === 'medium' && "bg-accent/20 text-accent",
                        task.priority === 'low' && "bg-mint/20 text-mint",
                      )}>
                        {task.priority}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(task.due_date), 'MMM d')}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
