import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useRoomMembers } from "@/hooks/useRoomMembers";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useToast } from "@/hooks/use-toast";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Crown, 
  UserMinus, 
  ListTodo, 
  Receipt, 
  Activity,
  Shield,
  Users,
  ChevronRight,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { CreateTaskDialog } from "@/components/tasks/CreateTaskDialog";
import { CreateExpenseDialog } from "@/components/expenses/CreateExpenseDialog";
import { AdminDeleteDialog } from "@/components/admin/AdminDeleteDialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Task {
  id: string;
  title: string;
  status: string;
  assigned_to: string;
  created_at: string;
}

interface Expense {
  id: string;
  title: string;
  total_amount: number;
  status: string;
  created_at: string;
}

interface RoomActivity {
  type: 'task' | 'expense';
  action: string;
  title: string;
  timestamp: string;
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user, currentRoom } = useAuth();
  const { members, refetch: refetchMembers } = useRoomMembers();
  const { isAdmin, isLoading: adminLoading, error: adminError } = useAdminCheck();
  const { toast } = useToast();
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recentActivity, setRecentActivity] = useState<RoomActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateExpense, setShowCreateExpense] = useState(false);
  const [deleteItem, setDeleteItem] = useState<{
    type: "expense" | "task";
    id: string;
    title: string;
  } | null>(null);
  
  // Use the dedicated admin check hook for reliable role verification
  const isCurrentUserAdmin = isAdmin;

  useEffect(() => {
    // Wait for admin check to complete before redirecting
    if (adminLoading) return;
    
    if (!currentRoom?.id) {
      navigate('/');
      return;
    }
    
    if (!isCurrentUserAdmin) {
      toast({
        title: "Access Denied",
        description: adminError || "Only room admins can access this panel",
        variant: "destructive"
      });
      navigate('/');
      return;
    }
    
    fetchData();
  }, [currentRoom?.id, isCurrentUserAdmin, adminLoading, adminError]);

  // Show loading while checking admin status
  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    );
  }

  const fetchData = async () => {
    if (!currentRoom?.id) return;
    
    setIsLoading(true);
    try {
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title, status, assigned_to, created_at')
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      setTasks(tasksData || []);
      
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('id, title, total_amount, status, created_at')
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      setExpenses(expensesData || []);
      
      const activity: RoomActivity[] = [];
      
      tasksData?.slice(0, 5).forEach(task => {
        activity.push({
          type: 'task',
          action: 'Task created',
          title: task.title,
          timestamp: task.created_at
        });
      });
      
      expensesData?.slice(0, 5).forEach(expense => {
        activity.push({
          type: 'expense',
          action: 'Expense added',
          title: expense.title,
          timestamp: expense.created_at
        });
      });
      
      activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRecentActivity(activity.slice(0, 10));
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentRoom?.id) return;
    
    try {
      const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('user_id', userId)
        .eq('room_id', currentRoom.id);
      
      if (error) throw error;
      
      toast({ title: "Member removed" });
      refetchMembers();
      setMemberToRemove(null);
    } catch (error) {
      console.error('Error removing member:', error);
      toast({ title: "Failed to remove member", variant: "destructive" });
    }
  };

  const handleNavChange = (tab: string) => {
    const routes: Record<string, string> = { home: '/', tasks: '/tasks', expenses: '/expenses', storage: '/storage', chat: '/chat' };
    navigate(routes[tab] || '/');
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const getMemberName = (userId: string) => members.find(m => m.user_id === userId)?.display_name || 'Unknown';

  const taskStats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
  };

  const expenseStats = {
    pending: expenses.filter(e => e.status === 'pending').length,
    totalAmount: expenses.reduce((sum, e) => sum + e.total_amount, 0),
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar title="Admin Panel" showBack={true} onBack={() => navigate('/')} hint="Manage your room"
        rightContent={<Badge variant="secondary" className="bg-primary/10 text-primary"><Crown className="h-3 w-3 mr-1" />Admin</Badge>}
      />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-primary/5"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><Users className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Members</span></div><p className="text-2xl font-bold">{members.length}</p></CardContent></Card>
          <Card className="bg-mint/5"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><ListTodo className="h-4 w-4 text-mint" /><span className="text-sm font-medium">Active Tasks</span></div><p className="text-2xl font-bold">{taskStats.pending + taskStats.inProgress}</p></CardContent></Card>
          <Card className="bg-coral/5"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><Receipt className="h-4 w-4 text-coral" /><span className="text-sm font-medium">Pending Bills</span></div><p className="text-2xl font-bold">{expenseStats.pending}</p></CardContent></Card>
          <Card className="bg-lavender/5"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><Activity className="h-4 w-4 text-lavender" /><span className="text-sm font-medium">Total Spent</span></div><p className="text-2xl font-bold">₹{expenseStats.totalAmount.toFixed(0)}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="members"><Users className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="actions"><Shield className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="manage"><Trash2 className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="activity"><Activity className="h-4 w-4" /></TabsTrigger>
          </TabsList>
          
          <TabsContent value="members" className="mt-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center justify-between"><span>Room Members</span><Badge variant="outline">{members.length}</Badge></CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {members.map((member) => (
                  <div key={member.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-xl">{member.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{member.display_name}{member.user_id === user?.id && <span className="text-muted-foreground text-sm ml-2">(You)</span>}</p>
                      {member.role === 'admin' && <Badge variant="secondary" className="text-xs"><Crown className="h-2 w-2 mr-1" />Admin</Badge>}
                    </div>
                    {member.user_id !== user?.id && (
                      <Button variant="ghost" size="sm" onClick={() => setMemberToRemove(member.user_id)} className="text-destructive hover:text-destructive hover:bg-destructive/10"><UserMinus className="h-4 w-4" /></Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="actions" className="mt-4 space-y-3">
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowCreateTask(true)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-mint/10 flex items-center justify-center"><ListTodo className="h-5 w-5 text-mint" /></div>
                <div className="flex-1"><p className="font-medium">Assign Task</p><p className="text-xs text-muted-foreground">Create and assign to any member</p></div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowCreateExpense(true)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-coral/10 flex items-center justify-center"><Receipt className="h-5 w-5 text-coral" /></div>
                <div className="flex-1"><p className="font-medium">Add Expense</p><p className="text-xs text-muted-foreground">Split bills with members</p></div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/room-settings')}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Shield className="h-5 w-5 text-primary" /></div>
                <div className="flex-1"><p className="font-medium">Room Settings</p><p className="text-xs text-muted-foreground">Manage room name and invite code</p></div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manage" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Delete Items (Requires Approval)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Tasks ({tasks.length})</p>
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2">
                      {tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.status}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteItem({ type: "task", id: task.id, title: task.title })}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {tasks.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No tasks</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Expenses ({expenses.length})</p>
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2">
                      {expenses.map((expense) => (
                        <div key={expense.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{expense.title}</p>
                            <p className="text-xs text-muted-foreground">₹{expense.total_amount}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteItem({ type: "expense", id: expense.id, title: expense.title })}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {expenses.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">No expenses</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="activity" className="mt-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
              <CardContent>
                {recentActivity.length === 0 ? <p className="text-center text-muted-foreground py-4">No recent activity</p> : (
                  <div className="space-y-3">
                    {recentActivity.map((activity, index) => (
                      <div key={index} className="flex items-start gap-3 pb-3 border-b border-border last:border-0">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", activity.type === 'task' ? "bg-mint/10" : "bg-coral/10")}>
                          {activity.type === 'task' ? <ListTodo className="h-4 w-4 text-mint" /> : <Receipt className="h-4 w-4 text-coral" />}
                        </div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{activity.title}</p><p className="text-xs text-muted-foreground">{activity.action}</p></div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(activity.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <DeleteConfirmDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)} title="Remove Member" description="Are you sure you want to remove this member from the room?" itemName={memberToRemove ? getMemberName(memberToRemove) : ''} onConfirm={async () => memberToRemove && await handleRemoveMember(memberToRemove)} />
      <CreateTaskDialog open={showCreateTask} onOpenChange={setShowCreateTask} onTaskCreated={fetchData} />
      <CreateExpenseDialog open={showCreateExpense} onOpenChange={setShowCreateExpense} onComplete={fetchData} />
      {deleteItem && (
        <AdminDeleteDialog
          open={!!deleteItem}
          onOpenChange={() => setDeleteItem(null)}
          itemType={deleteItem.type}
          itemId={deleteItem.id}
          itemTitle={deleteItem.title}
          onDeleted={fetchData}
          requiredApprovals={2}
        />
      )}
      <BottomNav activeTab="home" onTabChange={handleNavChange} />
    </div>
  );
}