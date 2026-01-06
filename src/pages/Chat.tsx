import { useState, useEffect, useRef, useCallback } from 'react';
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
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { AttachmentPicker, AttachmentPreview } from '@/components/chat/AttachmentPicker';
import { toast } from 'sonner';

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

interface PendingAttachment {
  url: string;
  type: 'image' | 'file' | 'voice';
  fileName: string;
}

export const Chat = () => {
  const { user, currentRoom } = useAuth();
  const { toast: toastHook } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, { display_name: string; avatar: string }>>(new Map());
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Fetch room members once
  useEffect(() => {
    if (currentRoom) {
      fetchRoomMembers();
      fetchMessages();
    }
  }, [currentRoom]);

  // Set up real-time subscription with optimistic updates
  useEffect(() => {
    if (!currentRoom || profilesMap.size === 0) return;

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`room-${currentRoom.id}-messages-realtime`)
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
          
          // Add message if not already present (prevents duplicates from optimistic updates)
          setMessages((prev) => {
            const exists = prev.some(m => m.id === newMsg.id);
            if (exists) return prev;
            return [...prev, newMsg];
          });

          // Show notification for messages from others
          if (newMsg.sender_id !== user?.id) {
            const senderProfile = profilesMap.get(newMsg.sender_id);
            toastHook({
              title: `${senderProfile?.avatar || '💬'} ${senderProfile?.display_name || 'Someone'}`,
              description: newMsg.message_type === 'text' 
                ? newMsg.content.slice(0, 50) + (newMsg.content.length > 50 ? '...' : '')
                : `Sent a ${newMsg.message_type}`,
            });
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentRoom, profilesMap, user?.id, toastHook]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchRoomMembers = async () => {
    if (!currentRoom) return;

    // First get member IDs
    const { data: membersData, error: membersError } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', currentRoom.id);

    if (membersError) {
      console.error('Error fetching room members:', membersError);
      return;
    }

    const userIds = membersData?.map(m => m.user_id) || [];

    // Then fetch profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return;
    }

    const members = userIds.map(userId => {
      const profile = profilesData?.find(p => p.user_id === userId);
      return {
        user_id: userId,
        profile: {
          display_name: profile?.display_name || 'Unknown',
          avatar: profile?.avatar || '😊',
        },
      };
    });

    setRoomMembers(members);

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

  const uploadVoiceNote = async (audioBlob: Blob, duration: number) => {
    if (!user) return;

    setIsSending(true);
    try {
      const fileName = `${user.id}/${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, audioBlob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(fileName);

      await sendMessageWithAttachment(publicUrl, 'voice', `Voice note (${duration}s)`);
    } catch (error) {
      console.error('Error uploading voice note:', error);
      toast.error('Failed to send voice note');
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachmentUploaded = (url: string, type: 'image' | 'file' | 'voice', fileName: string) => {
    setPendingAttachment({ url, type, fileName });
  };

  const sendMessageWithAttachment = async (attachmentUrl: string, type: string, fileName: string) => {
    if (!user || !currentRoom) return;

    const content = JSON.stringify({ url: attachmentUrl, fileName });

    const { error } = await supabase.from('messages').insert({
      room_id: currentRoom.id,
      sender_id: user.id,
      content,
      message_type: type,
    });

    if (error) throw error;
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentRoom || isSending) return;

    const hasText = newMessage.trim();
    const hasAttachment = pendingAttachment;

    if (!hasText && !hasAttachment) return;

    setIsSending(true);
    const messageText = newMessage.trim();
    
    // Clear input immediately for instant feedback
    setNewMessage('');

    try {
      // Send attachment first if exists
      if (hasAttachment) {
        await sendMessageWithAttachment(
          hasAttachment.url,
          hasAttachment.type,
          hasAttachment.fileName
        );
        setPendingAttachment(null);
      }

      // Send text message if exists
      if (messageText) {
        // Optimistic update - add message immediately
        const optimisticMessage: Message = {
          id: `temp-${Date.now()}`,
          room_id: currentRoom.id,
          sender_id: user.id,
          content: messageText,
          message_type: 'text',
          created_at: new Date().toISOString(),
        } as Message;

        setMessages(prev => [...prev, optimisticMessage]);

        const { data, error } = await supabase.from('messages').insert({
          room_id: currentRoom.id,
          sender_id: user.id,
          content: messageText,
          message_type: 'text',
        }).select().single();

        if (error) throw error;

        // Replace optimistic message with real one
        setMessages(prev => prev.map(m => 
          m.id === optimisticMessage.id ? data : m
        ));
      }

      inputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      toastHook({
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

  const parseAttachmentContent = (content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return { url: content, fileName: 'attachment' };
    }
  };

  const renderMessageContent = (message: Message, isOwnMessage: boolean) => {
    if (message.message_type === 'text') {
      return <p className="text-sm break-words">{message.content}</p>;
    }

    const attachment = parseAttachmentContent(message.content);

    if (message.message_type === 'image') {
      return (
        <img
          src={attachment.url}
          alt="Image"
          className="max-w-[250px] max-h-[200px] rounded-lg object-cover cursor-pointer"
          onClick={() => window.open(attachment.url, '_blank')}
        />
      );
    }

    if (message.message_type === 'voice') {
      return (
        <audio controls src={attachment.url} className="max-w-[200px]" />
      );
    }

    if (message.message_type === 'file') {
      return (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 text-sm hover:underline",
            isOwnMessage ? "text-primary-foreground" : "text-primary"
          )}
        >
          📎 {attachment.fileName || 'Download file'}
        </a>
      );
    }

    return <p className="text-sm break-words">{message.content}</p>;
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
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-all active:scale-95 press-effect"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-semibold text-foreground">{currentRoom?.name || 'Room Chat'}</h1>
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
              <div className="flex items-center justify-center">
                <span className="bg-muted/80 text-muted-foreground text-xs px-3 py-1 rounded-full">
                  {formatDateHeader(group.date)}
                </span>
              </div>

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
                    <div className="w-8 shrink-0">
                      {showAvatar && !isOwnMessage && (
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-sm bg-primary/20">
                            {senderProfile?.avatar || '😊'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>

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
                      {renderMessageContent(message, isOwnMessage)}
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

      {/* Pending Attachment Preview */}
      {pendingAttachment && (
        <div className="px-4 py-2 bg-card border-t border-border">
          <AttachmentPreview
            url={pendingAttachment.url}
            type={pendingAttachment.type}
            fileName={pendingAttachment.fileName}
            onRemove={() => setPendingAttachment(null)}
            isPreview
          />
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="sticky bottom-20 left-0 right-0 bg-card border-t border-border p-4 flex items-center gap-2"
      >
        <AttachmentPicker
          userId={user?.id || ''}
          onAttachmentUploaded={handleAttachmentUploaded}
          disabled={isSending}
        />
        
        <Input
          ref={inputRef}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 h-12 rounded-xl bg-muted border-0"
          disabled={isSending}
        />
        
        {newMessage.trim() || pendingAttachment ? (
          <Button
            type="submit"
            size="icon"
            className="h-12 w-12 rounded-xl shrink-0"
            disabled={isSending}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        ) : (
          <VoiceRecorder
            onRecordingComplete={uploadVoiceNote}
            disabled={isSending}
          />
        )}
      </form>

      <BottomNav activeTab="chat" onTabChange={handleTabChange} />
    </div>
  );
};
