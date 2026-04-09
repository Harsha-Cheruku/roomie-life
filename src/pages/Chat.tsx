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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (currentRoom) { fetchRoomMembers(); fetchMessages(); }
  }, [currentRoom]);

  // Mark messages as seen
  const markMessagesSeen = useCallback(async () => {
    if (!user || !currentRoom || messages.length === 0) return;
    const otherMessages = messages.filter(m => m.sender_id !== user.id && !m.deleted_at);
    if (otherMessages.length === 0) return;
    const lastMsg = otherMessages[otherMessages.length - 1];
    await supabase.from('message_views').upsert(
      { message_id: lastMsg.id, user_id: user.id, seen_at: new Date().toISOString() },
      { onConflict: 'message_id,user_id' }
    ).then(() => {});
  }, [messages, user, currentRoom]);

  useEffect(() => { markMessagesSeen(); }, [markMessagesSeen]);

  // Realtime subscription
  useEffect(() => {
    if (!currentRoom || profilesMap.size === 0) return;
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
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [currentRoom, profilesMap, user?.id, toastHook]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const fetchRoomMembers = async () => {
    if (!currentRoom) return;
    const { data: membersData } = await supabase.from('room_members').select('user_id').eq('room_id', currentRoom.id);
    const userIds = membersData?.map(m => m.user_id) || [];
    const { data: profilesData } = await supabase.from('profiles').select('user_id, display_name, avatar').in('user_id', userIds);
    const members = userIds.map(userId => {
      const profile = profilesData?.find(p => p.user_id === userId);
      return { user_id: userId, profile: { display_name: profile?.display_name || 'Unknown', avatar: profile?.avatar || '😊' } };
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
      const { data, error } = await supabase.from('messages').select('*').eq('room_id', currentRoom.id).order('created_at', { ascending: true }).limit(100);
      if (error) throw error;
      setMessages(data || []);
    } catch (error) { console.error('Error fetching messages:', error); }
    finally { setIsLoading(false); }
  };

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
    if (!newContent.trim()) return;
    await supabase.from('messages').update({ content: newContent, edited_at: new Date().toISOString() }).eq('id', messageId);
    setEditingMessageId(null);
    setNewMessage('');
  };

  const handleDeleteMessage = async (messageId: string) => {
    await supabase.from('messages').update({ deleted_at: new Date().toISOString(), content: 'This message was deleted' }).eq('id', messageId);
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
          <p className="text-sm break-words">{message.content}</p>
          {message.edited_at && <span className="text-[9px] opacity-50 italic">edited</span>}
        </div>
      );
    }
    const attachment = parseAttachmentContent(message.content);
    if (['image', 'voice', 'file'].includes(message.message_type)) {
      return <SecureAttachment filePath={attachment.filePath} type={message.message_type as any} fileName={attachment.fileName} isOwnMessage={isOwnMessage} />;
    }
    return <p className="text-sm break-words">{message.content}</p>;
  };

  const handleTabChange = (tab: string) => {
    const routes: Record<string, string> = { home: '/', tasks: '/tasks', expenses: '/expenses', storage: '/storage', chat: '/chat' };
    navigate(routes[tab] || '/');
  };

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="px-4 py-3 bg-card border-b border-border flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-all active:scale-95">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-semibold text-foreground">{currentRoom?.name || 'Room Chat'}</h1>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3 h-3" /><span>{roomMembers.length} members</span></div>
        </div>
        <div className="flex -space-x-2">
          {roomMembers.slice(0, 4).map(member => (
            <ProfileAvatar key={member.user_id} avatar={member.profile.avatar} size="sm" className="border-2 border-card" />
          ))}
          {roomMembers.length > 4 && <Avatar className="w-8 h-8 border-2 border-card"><AvatarFallback className="text-xs bg-muted">+{roomMembers.length - 4}</AvatarFallback></Avatar>}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12"><div className="text-5xl mb-4">💬</div><p className="text-muted-foreground">No messages yet</p></div>
        ) : (
          messageGroups.map((group, gi) => (
            <div key={gi} className="space-y-3">
              <div className="flex items-center justify-center">
                <span className="bg-muted/80 text-muted-foreground text-xs px-3 py-1 rounded-full">{formatDateHeader(group.date)}</span>
              </div>
              {group.messages.map((message, mi) => {
                const isOwnMessage = message.sender_id === user?.id;
                const senderProfile = profilesMap.get(message.sender_id);
                const showAvatar = mi === 0 || group.messages[mi - 1]?.sender_id !== message.sender_id;

                return (
                  <div key={message.id} className={cn('flex gap-2', isOwnMessage ? 'flex-row-reverse' : 'flex-row')}>
                    <div className="w-8 shrink-0">
                      {showAvatar && !isOwnMessage && <ProfileAvatar avatar={senderProfile?.avatar} size="sm" />}
                    </div>
                    <MessageActionsMenu
                      isOwnMessage={isOwnMessage}
                      messageContent={message.content}
                      messageType={message.message_type}
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
                        'max-w-[75%] rounded-2xl px-4 py-2',
                        message.message_type === 'sticker' ? 'bg-transparent px-0' :
                        isOwnMessage ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm'
                      )}>
                        {showAvatar && !isOwnMessage && message.message_type !== 'sticker' && (
                          <p className="text-xs font-medium text-primary mb-1">{senderProfile?.display_name || 'Unknown'}</p>
                        )}
                        {renderMessageContent(message, isOwnMessage)}
                        <div className={cn('flex items-center gap-1 mt-1', isOwnMessage ? 'justify-end' : '')}>
                          <p className={cn('text-[10px]', isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                            {formatTime(message.created_at)}
                          </p>
                          {isOwnMessage && !message.deleted_at && (
                            <CheckCheck className={cn('w-3 h-3', 'text-primary-foreground/50')} />
                          )}
                        </div>
                      </div>
                    </MessageActionsMenu>
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

      <form onSubmit={sendMessage} className="sticky bottom-20 left-0 right-0 bg-card border-t border-border p-4 flex items-center gap-2">
        <StickerPicker onStickerSelect={handleStickerSelect} disabled={isSending} />
        <AttachmentPicker userId={user?.id || ''} onAttachmentUploaded={handleAttachmentUploaded} disabled={isSending} />
        <Input ref={inputRef} value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder={editingMessageId ? "Edit message..." : "Type a message..."} className="flex-1 h-12 rounded-xl bg-muted border-0" disabled={isSending} />
        {newMessage.trim() || pendingAttachment ? (
          <Button type="submit" size="icon" className="h-12 w-12 rounded-xl shrink-0" disabled={isSending}>
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        ) : (
          <VoiceRecorder onRecordingComplete={uploadVoiceNote} disabled={isSending} />
        )}
      </form>

      <SeenByDialog open={!!seenDialogMessageId} onOpenChange={(o) => !o && setSeenDialogMessageId(null)} messageId={seenDialogMessageId || ''} />
      <BottomNav activeTab="chat" onTabChange={handleTabChange} />
    </div>
  );
};
