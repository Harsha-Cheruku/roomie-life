import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BottomNav } from '@/components/layout/BottomNav';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { CreateReminderDialog } from '@/components/reminders/CreateReminderDialog';
import { ReminderCard } from '@/components/reminders/ReminderCard';
import { Bell, Plus, BellOff, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNotifications } from '@/hooks/useNotifications';

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remind_at: string;
  status: 'scheduled' | 'notified' | 'completed';
  condition_type: string | null;
  condition_ref_id: string | null;
  allowed_completers: string[];
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface RoomMember {
  user_id: string;
  display_name: string;
  avatar: string;
}

export default function Reminders() {
  const { user, currentRoom } = useAuth();
  const navigate = useNavigate();
  const { sendReminderNotification } = useNotifications();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, { display_name: string; avatar: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('active');

  const handleNavChange = (tab: string) => {
    const routes: Record<string, string> = {
      home: '/',
      tasks: '/tasks',
      expenses: '/expenses',
      storage: '/storage',
      chat: '/chat',
    };
    navigate(routes[tab] || '/');
  };

  const fetchReminders = useCallback(async () => {
    if (!currentRoom?.id) return;

    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('room_id', currentRoom.id)
        .order('remind_at', { ascending: true });

      if (error) throw error;
      
      // Type assertion to handle the status field properly
      const typedReminders = (data || []).map(r => ({
        ...r,
        status: r.status as 'scheduled' | 'notified' | 'completed'
      }));
      
      setReminders(typedReminders);
    } catch (error: any) {
      toast.error('Failed to load reminders');
    } finally {
      setIsLoading(false);
    }
  }, [currentRoom?.id]);

  const fetchMembers = useCallback(async () => {
    if (!currentRoom?.id) return;

    try {
      const { data, error } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', currentRoom.id);

      if (error) throw error;

      const userIds = (data || []).map(m => m.user_id);
      
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar')
        .in('user_id', userIds);

      if (profileError) throw profileError;

      const memberList: RoomMember[] = (profiles || []).map(p => ({
        user_id: p.user_id,
        display_name: p.display_name,
        avatar: p.avatar || '😊'
      }));

      setMembers(memberList);

      const profileMap: Record<string, { display_name: string; avatar: string }> = {};
      memberList.forEach(m => {
        profileMap[m.user_id] = { display_name: m.display_name, avatar: m.avatar };
      });
      setMemberProfiles(profileMap);
    } catch (error: any) {
      console.error('Failed to fetch members:', error);
    }
  }, [currentRoom?.id]);

  // Check and update reminder status based on time
  const checkReminderTimes = useCallback(async () => {
    if (!user?.id) return;

    const now = new Date();
    const scheduledReminders = reminders.filter(
      r => r.status === 'scheduled' && 
      r.created_by === user.id && 
      new Date(r.remind_at) <= now
    );

    for (const reminder of scheduledReminders) {
      // Update status to notified
      await supabase
        .from('reminders')
        .update({ status: 'notified' })
        .eq('id', reminder.id);

      // Send notification with sound using our hook
      sendReminderNotification(reminder.title, reminder.description || undefined);
    }

    if (scheduledReminders.length > 0) {
      fetchReminders();
    }
  }, [reminders, user?.id, fetchReminders, sendReminderNotification]);

  useEffect(() => {
    fetchReminders();
    fetchMembers();
  }, [fetchReminders, fetchMembers]);

  // Real-time subscription
  useEffect(() => {
    if (!currentRoom?.id) return;

    const channel = supabase
      .channel('reminders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reminders',
          filter: `room_id=eq.${currentRoom.id}`
        },
        () => {
          fetchReminders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom?.id, fetchReminders]);

  // Check reminders periodically
  useEffect(() => {
    const interval = setInterval(checkReminderTimes, 30000); // Every 30 seconds
    checkReminderTimes(); // Check immediately
    return () => clearInterval(interval);
  }, [checkReminderTimes]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const activeReminders = reminders.filter(r => r.status !== 'completed');
  const completedReminders = reminders.filter(r => r.status === 'completed');

  const myReminders = activeReminders.filter(r => r.created_by === user?.id);
  const otherReminders = activeReminders.filter(r => r.created_by !== user?.id);

  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Please join a room first</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Reminders" />

      <div className="p-4 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              Shared Reminders
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gentle nudges for you, completable by roommates
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-primary/10 rounded-xl p-3 text-center">
            <Clock className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{activeReminders.length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="bg-amber-500/10 rounded-xl p-3 text-center">
            <Bell className="h-5 w-5 mx-auto mb-1 text-amber-600" />
            <p className="text-xl font-bold">{reminders.filter(r => r.status === 'notified').length}</p>
            <p className="text-xs text-muted-foreground">Notified</p>
          </div>
          <div className="bg-green-500/10 rounded-xl p-3 text-center">
            <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-600" />
            <p className="text-xl font-bold">{completedReminders.length}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="active" className="flex-1">Active</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-6">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : activeReminders.length === 0 ? (
              <div className="text-center py-12">
                <BellOff className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No active reminders</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setShowCreateDialog(true)}
                >
                  Create your first reminder
                </Button>
              </div>
            ) : (
              <>
                {myReminders.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      Your Reminders (you'll be notified)
                    </h2>
                    <div className="space-y-3">
                      {myReminders.map(reminder => (
                        <ReminderCard
                          key={reminder.id}
                          reminder={reminder}
                          currentUserId={user?.id || ''}
                          memberProfiles={memberProfiles}
                          onUpdate={fetchReminders}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {otherReminders.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Roommates' Reminders (you can help complete)
                    </h2>
                    <div className="space-y-3">
                      {otherReminders.map(reminder => (
                        <ReminderCard
                          key={reminder.id}
                          reminder={reminder}
                          currentUserId={user?.id || ''}
                          memberProfiles={memberProfiles}
                          onUpdate={fetchReminders}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-3">
            {completedReminders.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No completed reminders yet</p>
              </div>
            ) : (
              completedReminders.map(reminder => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  currentUserId={user?.id || ''}
                  memberProfiles={memberProfiles}
                  onUpdate={fetchReminders}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateReminderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        roomId={currentRoom.id}
        userId={user?.id || ''}
        members={members}
        onCreated={fetchReminders}
      />

      <BottomNav activeTab="reminders" onTabChange={handleNavChange} />
    </div>
  );
}
