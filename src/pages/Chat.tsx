import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, ArrowLeft, Users, Check, CheckCheck } from 'lucide-react';
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
import { SecureAttachment } from '@/components/chat/SecureAttachment';
import { StickerPicker } from '@/components/chat/StickerPicker';
import { MessageActionsMenu } from '@/components/chat/MessageActionsMenu';
import { SeenByDialog } from '@/components/chat/SeenByDialog';
import { toast } from 'sonner';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

interface Message {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}

interface RoomMember {
  user_id: string;
  profile: { display_name: string; avatar: string };
}

interface PendingAttachment {
  url: string;
  type: 'image' | 'file' | 'voice';
  fileName: string;
}

interface SeenReceipt {
  message_id: string;
  user_id: string;
  seen_at: string;
}

interface Reaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

const sortSeenReceipts = (receipts: SeenReceipt[]) =>
  [...receipts].sort((a, b) => new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime());

const mergeSeenReceipts = (
  current: Record<string, SeenReceipt[]>,
  receipts: SeenReceipt[]
) => {
  const next = { ...current };

  receipts.forEach((receipt) => {
    next[receipt.message_id] = sortSeenReceipts([
      ...(next[receipt.message_id] ?? []).filter((existing) => existing.user_id !== receipt.user_id),
      receipt,
    ]);
  });

  return next;
};

const messagesAreEqual = (current: Message[], next: Message[]) => {
  if (current.length !== next.length) return false;

  return current.every((message, index) => {
    const candidate = next[index];

    return (
      candidate &&
      message.id === candidate.id &&
      message.content === candidate.content &&
      message.message_type === candidate.message_type &&
      message.created_at === candidate.created_at &&
      message.edited_at === candidate.edited_at &&
      message.deleted_at === candidate.deleted_at
    );
  });
};

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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [seenDialogMessageId, setSeenDialogMessageId] = useState<string | null>(null);
  const [messageViews, setMessageViews] = useState<Record<string, SeenReceipt[]>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const autoScrollRef = useRef(true);

  const isNearBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = scrollRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    });
  }, []);

  useEffect(() => {
    messageIdsRef.current = new Set(messages.map((message) => message.id));
  }, [messages]);

  const fetchMessageViews = useCallback(async (messageList: Message[]) => {
    if (messageList.length === 0) {
      setMessageViews({});
      return;
    }

    const { data, error } = await supabase
      .from('message_views')
      .select('message_id, user_id, seen_at')
      .in('message_id', messageList.map((message) => message.id));

    if (error) {
      console.error('Error fetching message views:', error);
      return;
    }

    setMessageViews(mergeSeenReceipts({}, (data || []) as SeenReceipt[]));
  }, []);

  const fetchReactions = useCallback(async (messageList: Message[]) => {
    if (messageList.length === 0) { setReactions({}); return; }
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageList.map((m) => m.id));
    if (error) { console.error('Error fetching reactions:', error); return; }
    const grouped: Record<string, Reaction[]> = {};
    (data || []).forEach((r) => {
      const key = r.message_id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r as Reaction);
    });
    setReactions(grouped);
  }, []);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = (reactions[messageId] || []).find((r) => r.user_id === user.id && r.emoji === emoji);
    setSelectedMessageId(null);
    if (existing) {
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter((r) => !(r.user_id === user.id && r.emoji === emoji)),
      }));
      await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji);
    } else {
      const optimistic: Reaction = { message_id: messageId, user_id: user.id, emoji };
      setReactions((prev) => ({ ...prev, [messageId]: [...(prev[messageId] || []), optimistic] }));
      const { error } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
      if (error && error.code !== '23505') {
        toast.error('Failed to react');
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter((r) => !(r.user_id === user.id && r.emoji === emoji)),
        }));
      }
    }
  }, [reactions, user]);

  const fetchRoomMembers = useCallback(async () => {
    if (!currentRoom) return;

    const { data: membersData } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', currentRoom.id);

    const userIds = membersData?.map((member) => member.user_id) || [];

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar')
      .in('user_id', userIds);

    const members = userIds.map((userId) => {
      const profile = profilesData?.find((item) => item.user_id === userId);
      return {
        user_id: userId,
        profile: {
          display_name: profile?.display_name || 'Unknown',
          avatar: profile?.avatar || '😊',
        },
      };
    });

    setRoomMembers(members);

    const nextProfilesMap = new Map<string, { display_name: string; avatar: string }>();
    members.forEach((member) => nextProfilesMap.set(member.user_id, member.profile));
    setProfilesMap(nextProfilesMap);
  }, [currentRoom]);

  const fetchMessages = useCallback(async (options?: { silent?: boolean }) => {
    if (!currentRoom) return;
    if (!options?.silent) setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', currentRoom.id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      const nextMessages = data || [];
      setMessages((prev) => (messagesAreEqual(prev, nextMessages) ? prev : nextMessages));
      await Promise.all([fetchMessageViews(nextMessages), fetchReactions(nextMessages)]);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, [currentRoom, fetchMessageViews, fetchReactions]);

  useEffect(() => {
    if (!currentRoom) {
      setMessages([]);
      setMessageViews({});
      setIsLoading(false);
      return;
    }

    autoScrollRef.current = true;
    setSelectedMessageId(null);
    void fetchRoomMembers();
    void fetchMessages();
  }, [currentRoom, fetchMessages, fetchRoomMembers]);

  // Mark messages as seen
  const markMessagesSeen = useCallback(async () => {
    if (!user || !currentRoom || messages.length === 0) return;
    const unseenIncoming = messages.filter((message) => {
      if (message.sender_id === user.id || message.deleted_at) return false;
      return !(messageViews[message.id] || []).some((receipt) => receipt.user_id === user.id);
    });

    if (unseenIncoming.length === 0) return;

    const seenAt = new Date().toISOString();
    const payload = unseenIncoming.map((message) => ({
      message_id: message.id,
      user_id: user.id,
      seen_at: seenAt,
    }));

    const { error } = await supabase.from('message_views').upsert(payload, { onConflict: 'message_id,user_id', ignoreDuplicates: true });

    if (!error) {
      setMessageViews((prev) => mergeSeenReceipts(prev, payload));
    } else {
      console.error('Error marking messages seen:', error);
    }
  }, [currentRoom, messageViews, messages, user]);

  useEffect(() => { markMessagesSeen(); }, [markMessagesSeen]);

  // Realtime subscription
  useEffect(() => {
    if (!currentRoom) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`room-${currentRoom.id}-messages-realtime`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoom.id}` },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_id !== user?.id) {
            const senderProfile = profilesMap.get(newMsg.sender_id);
            toastHook({ title: senderProfile?.display_name || 'Someone', description: newMsg.message_type === 'text' ? newMsg.content.slice(0, 50) : `Sent a ${newMsg.message_type}` });
          }
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoom.id}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_views' },
        (payload) => {
          if (payload.eventType === 'DELETE') return;

          const receipt = payload.new as Partial<SeenReceipt>;
          if (!receipt.message_id || !receipt.user_id || !receipt.seen_at) return;
          if (!messageIdsRef.current.has(receipt.message_id)) return;

          setMessageViews((prev) => mergeSeenReceipts(prev, [receipt as SeenReceipt]));
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const r = payload.new as Reaction;
          if (!messageIdsRef.current.has(r.message_id)) return;
          setReactions((prev) => {
            const list = prev[r.message_id] || [];
            if (list.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) return prev;
            return { ...prev, [r.message_id]: [...list, r] };
          });
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const r = payload.old as Reaction;
          if (!r.message_id) return;
          setReactions((prev) => ({
            ...prev,
            [r.message_id]: (prev[r.message_id] || []).filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)),
          }));
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [currentRoom, profilesMap, user?.id, toastHook]);

  // Realtime + reconnect-only refresh. Removed 3.5s polling that caused message-list churn / lag.
  useEffect(() => {
    if (!currentRoom) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchMessages({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [currentRoom, fetchMessages]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Click outside to deselect
  useEffect(() => {
    if (!selectedMessageId) return;
    const handler = () => setSelectedMessageId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [selectedMessageId]);

  const uploadVoiceNote = async (audioBlob: Blob, duration: number) => {
    if (!user) return;
    setIsSending(true);
    try {
      const fileName = `${user.id}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(fileName, audioBlob);
      if (uploadError) throw uploadError;
      await sendMessageWithAttachment(fileName, 'voice', `Voice note (${duration}s)`);
    } catch (error) { toast.error('Failed to send voice note'); }
    finally { setIsSending(false); }
  };

  const handleAttachmentUploaded = (filePath: string, type: 'image' | 'file' | 'voice', fileName: string) => {
    setPendingAttachment({ url: filePath, type, fileName });
  };

  const sendMessageWithAttachment = async (filePath: string, type: string, fileName: string) => {
    if (!user || !currentRoom) return;
    const content = JSON.stringify({ filePath, fileName });
    await supabase.from('messages').insert({ room_id: currentRoom.id, sender_id: user.id, content, message_type: type });
  };

  const handleStickerSelect = async (sticker: string) => {
    if (!user || !currentRoom) return;
    setIsSending(true);
    try {
      await supabase.from('messages').insert({ room_id: currentRoom.id, sender_id: user.id, content: sticker, message_type: 'sticker' });
    } catch (e) { toast.error('Failed to send sticker'); }
    finally { setIsSending(false); }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    const trimmedContent = newContent.trim();
    if (!trimmedContent) return;

    const editedAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, content: trimmedContent, edited_at: editedAt }
          : message
      )
    );

    const { error } = await supabase
      .from('messages')
      .update({ content: trimmedContent, edited_at: editedAt })
      .eq('id', messageId);

    if (error) {
      console.error('Error editing message:', error);
      toast.error('Failed to edit message');
      await fetchMessages({ silent: true });
      return;
    }

    setEditingMessageId(null);
    setNewMessage('');
  };

  const handleDeleteMessage = async (messageId: string) => {
    const deletedAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, deleted_at: deletedAt, content: 'This message was deleted' }
          : message
      )
    );

    const { error } = await supabase
      .from('messages')
      .update({ deleted_at: deletedAt, content: 'This message was deleted' })
      .eq('id', messageId);

    if (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
      await fetchMessages({ silent: true });
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentRoom || isSending) return;

    // Handle edit mode
    if (editingMessageId) {
      await handleEditMessage(editingMessageId, newMessage);
      return;
    }

    const hasText = newMessage.trim();
    const hasAttachment = pendingAttachment;
    if (!hasText && !hasAttachment) return;

    setIsSending(true);
    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      if (hasAttachment) {
        await sendMessageWithAttachment(hasAttachment.url, hasAttachment.type, hasAttachment.fileName);
        setPendingAttachment(null);
      }
      if (messageText) {
        const optimisticMessage: Message = {
          id: `temp-${Date.now()}`, sender_id: user.id, content: messageText,
          message_type: 'text', created_at: new Date().toISOString(),
        } as Message;
        setMessages(prev => [...prev, optimisticMessage]);
        const { data, error } = await supabase.from('messages').insert({
          room_id: currentRoom.id, sender_id: user.id, content: messageText, message_type: 'text',
        }).select().single();
        if (error) throw error;
        setMessages(prev => prev.map(m => m.id === optimisticMessage.id ? data : m));
      }
      inputRef.current?.focus();
    } catch (error) {
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
      toastHook({ title: 'Failed to send', variant: 'destructive' });
    } finally { setIsSending(false); }
  };

  const formatTime = (dateString: string) => new Date(dateString).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    msgs.forEach(msg => {
      const msgDate = new Date(msg.created_at).toDateString();
      if (msgDate !== currentDate) { currentDate = msgDate; groups.push({ date: msg.created_at, messages: [msg] }); }
      else { groups[groups.length - 1].messages.push(msg); }
    });
    return groups;
  };

  const parseAttachmentContent = (content: string) => {
    try { const p = JSON.parse(content); return { filePath: p.filePath || p.url, fileName: p.fileName || 'attachment' }; }
    catch { return { filePath: content, fileName: 'attachment' }; }
  };

  const renderMessageContent = (message: Message, isOwnMessage: boolean) => {
    if (message.deleted_at) return <p className="text-sm italic opacity-60">🚫 This message was deleted</p>;
    if (message.message_type === 'sticker') return <span className="text-4xl">{message.content}</span>;
    if (message.message_type === 'text') {
      return (
        <div>
          <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
          {message.edited_at && <span className="text-[9px] opacity-50 italic">edited</span>}
        </div>
      );
    }
    const attachment = parseAttachmentContent(message.content);
    if (['image', 'voice', 'file'].includes(message.message_type)) {
      return <SecureAttachment filePath={attachment.filePath} type={message.message_type as any} fileName={attachment.fileName} isOwnMessage={isOwnMessage} />;
    }
    return <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>;
  };

  const handleTabChange = (tab: string) => {
    const routes: Record<string, string> = { home: '/', tasks: '/tasks', expenses: '/expenses', storage: '/storage', chat: '/chat' };
    navigate(routes[tab] || '/');
  };

  const getSeenReceipts = (messageId: string) =>
    sortSeenReceipts((messageViews[messageId] || []).filter((receipt) => receipt.user_id !== user?.id));

  const getSeenLabel = (receipts: SeenReceipt[]) => {
    if (receipts.length === 0) return 'Sent';

    const names = receipts.map((receipt) => profilesMap.get(receipt.user_id)?.display_name || 'Someone');

    if (receipts.length === 1) return `Seen by ${names[0]}`;
    return `Seen by ${names[0]} +${receipts.length - 1}`;
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground shadow-sm transition-all active:scale-95 hover:bg-muted/80">
          <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold text-foreground">{currentRoom?.name || 'Room Chat'}</h1>
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3 h-3" /><span>{roomMembers.length} members</span></div>
          </div>
          <div className="flex -space-x-2">
            {roomMembers.slice(0, 4).map(member => (
              <ProfileAvatar key={member.user_id} avatar={member.profile.avatar} size="sm" className="ring-2 ring-card" />
            ))}
            {roomMembers.length > 4 && <Avatar className="w-8 h-8 ring-2 ring-card"><AvatarFallback className="text-xs bg-muted">+{roomMembers.length - 4}</AvatarFallback></Avatar>}
          </div>
        </div>
      </header>

      <div ref={scrollRef} style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.35)_100%)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12"><div className="text-5xl mb-4">💬</div><p className="text-muted-foreground">No messages yet</p></div>
        ) : (
          messageGroups.map((group, gi) => (
            <div key={gi} className="space-y-3">
              <div className="flex items-center justify-center">
                <span className="rounded-full border border-border/60 bg-card/80 px-3 py-1 text-xs text-muted-foreground shadow-sm">{formatDateHeader(group.date)}</span>
              </div>
              {group.messages.map((message, mi) => {
                const isOwnMessage = message.sender_id === user?.id;
                const senderProfile = profilesMap.get(message.sender_id);
                const showAvatar = mi === 0 || group.messages[mi - 1]?.sender_id !== message.sender_id;
                const nextMessage = group.messages[mi + 1];
                const isLastOwnInStack = isOwnMessage && (!nextMessage || nextMessage.sender_id !== message.sender_id);
                const seenReceipts = isOwnMessage ? getSeenReceipts(message.id) : [];
                const hasSeen = seenReceipts.length > 0;

                return (
                  <div key={message.id} className={cn('flex gap-2', isOwnMessage ? 'justify-end' : 'justify-start')}>
                    {!isOwnMessage && (
                      <div className="w-8 shrink-0">
                        {showAvatar ? <ProfileAvatar avatar={senderProfile?.avatar} size="sm" /> : null}
                      </div>
                    )}

                    <div className={cn('flex min-w-0 max-w-[78%] flex-col gap-1 sm:max-w-[72%]', isOwnMessage ? 'items-end' : 'items-start')}>
                      <MessageActionsMenu
                        isOwnMessage={isOwnMessage}
                        messageContent={message.content}
                        messageType={message.message_type}
                        selected={selectedMessageId === message.id}
                        onSelect={() => setSelectedMessageId((prev) => prev === message.id ? null : message.id)}
                        onReact={(emoji) => toggleReaction(message.id, emoji)}
                        onEdit={() => {
                          if (message.message_type === 'text' && !message.deleted_at) {
                            setEditingMessageId(message.id);
                            setNewMessage(message.content);
                            inputRef.current?.focus();
                          }
                        }}
                        onDelete={() => handleDeleteMessage(message.id)}
                        onViewSeen={() => setSeenDialogMessageId(message.id)}
                      >
                        <div className={cn(
                          'max-w-full rounded-[1.6rem] px-4 py-3 shadow-card transition-all',
                          message.message_type === 'sticker' ? 'bg-transparent px-0 py-0 shadow-none' :
                          isOwnMessage ? 'bg-primary text-primary-foreground rounded-br-md' : 'rounded-bl-md border border-border/60 bg-card text-foreground'
                        )}>
                          {showAvatar && !isOwnMessage && message.message_type !== 'sticker' && (
                            <p className="mb-1 text-xs font-semibold text-primary">{senderProfile?.display_name || 'Unknown'}</p>
                          )}
                          {renderMessageContent(message, isOwnMessage)}
                          {message.message_type !== 'sticker' && (
                            <div className={cn('mt-1 flex items-center gap-1', isOwnMessage ? 'justify-end' : 'justify-start')}>
                              <p className={cn('text-[10px]', isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                                {formatTime(message.created_at)}
                              </p>
                              {isOwnMessage && !message.deleted_at && (
                                <CheckCheck className={cn('h-3 w-3', hasSeen ? 'text-primary-foreground' : 'text-primary-foreground/50')} />
                              )}
                            </div>
                          )}
                        </div>
                      </MessageActionsMenu>

                      {(reactions[message.id]?.length ?? 0) > 0 && (
                        <div className={cn('flex flex-wrap gap-1', isOwnMessage ? 'justify-end' : 'justify-start')}>
                          {Object.entries(
                            (reactions[message.id] || []).reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
                              if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
                              acc[r.emoji].count += 1;
                              if (r.user_id === user?.id) acc[r.emoji].mine = true;
                              return acc;
                            }, {})
                          ).map(([emoji, info]) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleReaction(message.id, emoji); }}
                              className={cn(
                                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-sm transition-colors',
                                info.mine ? 'border-primary/40 bg-primary/15 text-foreground' : 'border-border/60 bg-card text-foreground hover:bg-muted'
                              )}
                            >
                              <span className="text-sm leading-none">{emoji}</span>
                              <span className="text-[10px] font-medium">{info.count}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {isOwnMessage && !message.deleted_at && isLastOwnInStack && (
                        hasSeen ? (
                          <button
                            type="button"
                            onClick={() => setSeenDialogMessageId(message.id)}
                            className="flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-card/80 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm transition-colors hover:bg-card"
                          >
                            <div className="flex -space-x-2">
                              {seenReceipts.slice(0, 3).map((receipt) => (
                                <ProfileAvatar
                                  key={`${message.id}-${receipt.user_id}`}
                                  avatar={profilesMap.get(receipt.user_id)?.avatar}
                                  size="xs"
                                  className="ring-2 ring-background"
                                />
                              ))}
                            </div>
                            <span>{getSeenLabel(seenReceipts)}</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                            <Check className="h-3 w-3" />
                            <span>Sent</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {pendingAttachment && (
        <div className="px-4 py-2 bg-card border-t border-border">
          <AttachmentPreview url={pendingAttachment.url} type={pendingAttachment.type} fileName={pendingAttachment.fileName} onRemove={() => setPendingAttachment(null)} isPreview />
        </div>
      )}

      {editingMessageId && (
        <div className="px-4 py-2 bg-accent/20 border-t border-border flex items-center gap-2">
          <span className="text-xs text-accent font-medium">Editing message</span>
          <button onClick={() => { setEditingMessageId(null); setNewMessage(''); }} className="text-xs text-destructive ml-auto">Cancel</button>
        </div>
      )}

      <form onSubmit={sendMessage} className="sticky bottom-20 left-0 right-0 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2 rounded-[1.75rem] border border-border/60 bg-card px-3 py-2 shadow-card">
          <StickerPicker onStickerSelect={handleStickerSelect} disabled={isSending} />
          <AttachmentPicker userId={user?.id || ''} onAttachmentUploaded={handleAttachmentUploaded} disabled={isSending} />
          <Input ref={inputRef} value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder={editingMessageId ? "Edit message..." : "Type a message..."} className="h-11 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0" disabled={isSending} />
          {newMessage.trim() || pendingAttachment ? (
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-full" disabled={isSending}>
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          ) : (
            <VoiceRecorder onRecordingComplete={uploadVoiceNote} disabled={isSending} />
          )}
        </div>
      </form>

      <SeenByDialog open={!!seenDialogMessageId} onOpenChange={(o) => !o && setSeenDialogMessageId(null)} messageId={seenDialogMessageId || ''} />
      <BottomNav activeTab="chat" onTabChange={handleTabChange} />
    </div>
  );
};
