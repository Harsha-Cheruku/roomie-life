import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock, CheckCircle, BellOff, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  remind_at: string;
  status: 'scheduled' | 'notified' | 'completed';
  allowed_completers: string[];
  created_by: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface FollowUpsSectionProps {
  roomId: string;
}

export const FollowUpsSection = ({ roomId }: FollowUpsSectionProps) => {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mine' | 'active' | 'completed'>('active');
  const [memberProfiles, setMemberProfiles] = useState<Record<string, { display_name: string; avatar: string }>>({});

  const fetchReminders = useCallback(async () => {
    if (!roomId) return;

    try {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('room_id', roomId)
        .order('remind_at', { ascending: true });

      if (error) throw error;

      const typedReminders = (data || []).map(r => ({
        ...r,
        status: r.status as 'scheduled' | 'notified' | 'completed'
      }));

      setReminders(typedReminders);

      // Fetch member profiles
      const userIds = [...new Set(data?.map(r => r.created_by) || [])];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, avatar')
          .in('user_id', userIds);

        const profileMap: Record<string, { display_name: string; avatar: string }> = {};
        profiles?.forEach(p => {
          profileMap[p.user_id] = { display_name: p.display_name, avatar: p.avatar || '😊' };
        });
        setMemberProfiles(profileMap);
      }
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchReminders();

    const channel = supabase
      .channel('followups-reminders')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'reminders',
        filter: `room_id=eq.${roomId}`
      }, () => fetchReminders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchReminders]);

  const handleComplete = async (reminder: Reminder) => {
    if (!user?.id) return;

    // Check if user can complete
    const canComplete = 
      reminder.allowed_completers.length === 0 || 
      reminder.allowed_completers.includes(user.id) ||
      reminder.created_by === user.id;

    if (!canComplete) {
      toast.error("You're not allowed to complete this reminder");
      return;
    }

    try {
      const { error } = await supabase
        .from('reminders')
        .update({
          status: 'completed',
          completed_by: user.id,
          completed_at: new Date().toISOString()
        })
        .eq('id', reminder.id);

      if (error) throw error;
      toast.success('Follow-up completed!');
      fetchReminders();
    } catch (error) {
      toast.error('Failed to complete');
    }
  };

  const filteredReminders = reminders.filter(r => {
    if (filter === 'mine') return r.created_by === user?.id;
    if (filter === 'active') return r.status !== 'completed';
    if (filter === 'completed') return r.status === 'completed';
    return true;
  });

  const activeCount = reminders.filter(r => r.status !== 'completed').length;

  if (reminders.length === 0 && !isLoading) {
    return null; // Don't show if no reminders
  }

  return (
    <div className="px-4 mb-4">
      <Card className="overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between bg-gradient-to-r from-lavender/10 to-primary/5"
        >
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-lavender" />
            <h3 className="font-semibold">Follow-ups</h3>
            {activeCount > 0 && (
              <Badge variant="secondary" className="bg-lavender/20 text-lavender">
                {activeCount} active
              </Badge>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {isExpanded && (
          <CardContent className="p-4 pt-0">
            {/* Filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 pt-4">
              {[
                { key: 'active' as const, label: 'Active' },
                { key: 'mine' as const, label: 'My Follow-ups' },
                { key: 'completed' as const, label: 'Completed' },
                { key: 'all' as const, label: 'All' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                    filter === f.key
                      ? "bg-lavender text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                Loading...
              </div>
            ) : filteredReminders.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <BellOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No follow-ups found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredReminders.map((reminder) => {
                  const isOverdue = reminder.status !== 'completed' && isPast(new Date(reminder.remind_at));
                  const creatorProfile = memberProfiles[reminder.created_by];

                  return (
                    <div
                      key={reminder.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg transition-colors",
                        reminder.status === 'completed' 
                          ? "bg-muted/30 opacity-60"
                          : isOverdue
                            ? "bg-coral/10 border border-coral/30"
                            : "bg-muted/50"
                      )}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm flex-shrink-0">
                        {creatorProfile?.avatar || '😊'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium text-sm",
                          reminder.status === 'completed' && "line-through text-muted-foreground"
                        )}>
                          {reminder.title}
                        </p>
                        {reminder.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {reminder.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className={cn(
                            "text-xs",
                            isOverdue ? "text-coral" : "text-muted-foreground"
                          )}>
                            {reminder.status === 'completed' 
                              ? `Completed ${formatDistanceToNow(new Date(reminder.completed_at!), { addSuffix: true })}`
                              : isOverdue
                                ? `Overdue by ${formatDistanceToNow(new Date(reminder.remind_at))}`
                                : format(new Date(reminder.remind_at), 'MMM d, h:mm a')
                            }
                          </span>
                        </div>
                      </div>

                      {reminder.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleComplete(reminder)}
                          className="flex-shrink-0 h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
                        >
                          <CheckCircle className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};
