import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/layout/BottomNav';

interface Message {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
}

interface RoomMember {
  user_id: string;
  profile: {
    display_name: string;
    avatar: string;
  };
}

export const Chat = () => {
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, { display_name: string; avatar: string }>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentRoom) {
      fetchRoomMembers();
      fetchMessages();
    }
  }, [currentRoom]);

  useEffect(() => {
    if (!currentRoom || profilesMap.size === 0) return;

    const channel = supabase
      .channel(`room-${currentRoom.id}-messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${currentRoom.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => [...prev, newMsg]);

          // Show notification toast for messages from others
          if (newMsg.sender_id !== user?.id) {
            const senderProfile = profilesMap.get(newMsg.sender_id);
            toast({
              title: `${senderProfile?.avatar || '💬'} ${senderProfile?.display_name || 'Someone'}`,
              description: newMsg.content.slice(0, 50) + (newMsg.content.length > 50 ? '...' : ''),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom, profilesMap, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const fetchRoomMembers = async () => {
    if (!currentRoom) return;

    const { data, error } = await supabase
      .from('room_members')
      .select(`
        user_id,
        profiles:user_id (
          display_name,
          avatar
        )
      `)
      .eq('room_id', currentRoom.id);

    if (error) {
      console.error('Error fetching room members:', error);
      return;
    }

    const members = data?.map((member: any) => ({
      user_id: member.user_id,
      profile: {
        display_name: member.profiles?.display_name || 'Unknown',
        avatar: member.profiles?.avatar || '😊',
      },
    })) || [];

    setRoomMembers(members);

    // Create a map for quick profile lookups
    const map = new Map<string, { display_name: string; avatar: string }>();
    members.forEach(m => map.set(m.user_id, m.profile));
    setProfilesMap(map);
  };

  const fetchMessages = async () => {
    if (!currentRoom) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !currentRoom || isSending) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    try {
      const { error } = await supabase.from('messages').insert({
        room_id: currentRoom.id,
        sender_id: user.id,
        content: messageContent,
        message_type: 'text',
      });

      if (error) throw error;

      inputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageContent); // Restore message on error
      toast({
        title: 'Failed to send',
        description: 'Could not send your message. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    msgs.forEach((msg) => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msg.created_at, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'home') navigate('/');
    else if (tab === 'tasks') navigate('/tasks');
    else if (tab === 'expenses') navigate('/expenses');
    else if (tab === 'storage') navigate('/storage');
    else if (tab === 'chat') navigate('/chat');
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      {/* Header */}
      <header className="px-4 py-3 bg-card border-b border-border flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-semibold text-foreground">{currentRoom?.name || 'Room Chat'}</h1>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>{roomMembers.length} members</span>
          </div>
        </div>
        <div className="flex -space-x-2">
          {roomMembers.slice(0, 4).map((member) => (
            <Avatar key={member.user_id} className="w-8 h-8 border-2 border-card">
              <AvatarFallback className="text-sm bg-primary/20">
                {member.profile.avatar}
              </AvatarFallback>
            </Avatar>
          ))}
          {roomMembers.length > 4 && (
            <Avatar className="w-8 h-8 border-2 border-card">
              <AvatarFallback className="text-xs bg-muted">
                +{roomMembers.length - 4}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </header>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Be the first to say hello!</p>
          </div>
        ) : (
          messageGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-3">
              {/* Date header */}
              <div className="flex items-center justify-center">
                <span className="bg-muted/80 text-muted-foreground text-xs px-3 py-1 rounded-full">
                  {formatDateHeader(group.date)}
                </span>
              </div>

              {/* Messages for this date */}
              {group.messages.map((message, msgIndex) => {
                const isOwnMessage = message.sender_id === user?.id;
                const senderProfile = profilesMap.get(message.sender_id);
                const showAvatar = msgIndex === 0 || 
                  group.messages[msgIndex - 1]?.sender_id !== message.sender_id;

                return (
                  <div
                    key={message.id}
                    className={cn(
                      'flex gap-2',
                      isOwnMessage ? 'flex-row-reverse' : 'flex-row'
                    )}
                  >
                    {/* Avatar */}
                    <div className="w-8 shrink-0">
                      {showAvatar && !isOwnMessage && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-sm bg-primary/20">
                            {senderProfile?.avatar || '😊'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>

                    {/* Message bubble */}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-4 py-2',
                        isOwnMessage
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-muted text-foreground rounded-tl-sm'
                      )}
                    >
                      {showAvatar && !isOwnMessage && (
                        <p className="text-xs font-medium text-primary mb-1">
                          {senderProfile?.display_name || 'Unknown'}
                        </p>
                      )}
                      <p className="text-sm break-words">{message.content}</p>
                      <p
                        className={cn(
                          'text-[10px] mt-1',
                          isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        )}
                      >
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="sticky bottom-20 left-0 right-0 bg-card border-t border-border p-4 flex items-center gap-3"
      >
        <Input
          ref={inputRef}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 h-12 rounded-xl bg-muted border-0"
          disabled={isSending}
        />
        <Button
          type="submit"
          size="icon"
          className="h-12 w-12 rounded-xl shrink-0"
          disabled={!newMessage.trim() || isSending}
        >
          {isSending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </form>

      <BottomNav activeTab="chat" onTabChange={handleTabChange} />
    </div>
  );
};
