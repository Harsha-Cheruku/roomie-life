import { useState } from "react";
import { Send, Paperclip, Mic, Image, Smile } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  text: string;
  sender: string;
  avatar: string;
  timestamp: string;
  isMe: boolean;
  type?: "text" | "image" | "system";
}

const mockMessages: Message[] = [
  { id: "1", text: "Hey everyone! Don't forget we need to pay the electricity bill tomorrow 💡", sender: "Alex", avatar: "🎮", timestamp: "10:30 AM", isMe: false },
  { id: "2", text: "Thanks for the reminder! I'll transfer my share today", sender: "You", avatar: "😎", timestamp: "10:32 AM", isMe: true },
  { id: "3", text: "Same here! 🙌", sender: "Sam", avatar: "🎵", timestamp: "10:33 AM", isMe: false },
  { id: "4", text: "Also, anyone up for movie night this weekend?", sender: "Jordan", avatar: "📚", timestamp: "10:45 AM", isMe: false },
  { id: "5", text: "Count me in! 🎬🍿", sender: "You", avatar: "😎", timestamp: "10:46 AM", isMe: true },
  { id: "6", text: "Let's watch something good this time 😂", sender: "Alex", avatar: "🎮", timestamp: "10:47 AM", isMe: false },
  { id: "7", text: "I'll add a task for grocery shopping for snacks!", sender: "Sam", avatar: "🎵", timestamp: "10:50 AM", isMe: false },
];

const roommates = [
  { name: "Room 204", avatar: "🏠", isGroup: true, unread: 3, lastMessage: "Sam: I'll add a task for..." },
  { name: "Alex", avatar: "🎮", isGroup: false, unread: 0, lastMessage: "Sure, sounds good!" },
  { name: "Sam", avatar: "🎵", isGroup: false, unread: 1, lastMessage: "Did you see my message?" },
  { name: "Jordan", avatar: "📚", isGroup: false, unread: 0, lastMessage: "Thanks!" },
];

export const Chat = () => {
  const [selectedChat, setSelectedChat] = useState<string | null>("Room 204");
  const [message, setMessage] = useState("");

  if (!selectedChat) {
    return (
      <div className="min-h-screen bg-background pb-32">
        <header className="px-4 pt-6 pb-4">
          <h1 className="font-display text-2xl font-bold text-foreground">Messages</h1>
        </header>

        <div className="px-4 space-y-3">
          {roommates.map((chat, index) => (
            <button
              key={chat.name}
              onClick={() => setSelectedChat(chat.name)}
              className="w-full bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 text-left animate-slide-up hover:bg-muted/50 transition-colors"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-2xl">
                  {chat.avatar}
                </div>
                {chat.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-coral rounded-full text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                    {chat.unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{chat.name}</p>
                  <span className="text-xs text-muted-foreground">10:50 AM</span>
                </div>
                <p className="text-sm text-muted-foreground truncate mt-1">{chat.lastMessage}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Chat Header */}
      <header className="px-4 py-4 bg-card border-b border-border flex items-center gap-3">
        <button
          onClick={() => setSelectedChat(null)}
          className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"
        >
          ←
        </button>
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
          🏠
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground">Room 204</p>
          <p className="text-xs text-muted-foreground">4 members • 3 online</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32 space-y-4">
        {mockMessages.map((msg, index) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-2 animate-slide-up",
              msg.isMe ? "flex-row-reverse" : "flex-row"
            )}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            {!msg.isMe && <span className="text-2xl">{msg.avatar}</span>}
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-4 py-3",
                msg.isMe
                  ? "gradient-primary text-primary-foreground rounded-br-md"
                  : "bg-card shadow-card rounded-bl-md"
              )}
            >
              {!msg.isMe && (
                <p className="text-xs font-semibold text-primary mb-1">{msg.sender}</p>
              )}
              <p className={cn("text-sm", msg.isMe ? "text-primary-foreground" : "text-foreground")}>
                {msg.text}
              </p>
              <p
                className={cn(
                  "text-[10px] mt-1",
                  msg.isMe ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
                )}
              >
                {msg.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="fixed bottom-20 left-0 right-0 bg-card border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Paperclip className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Image className="w-5 h-5" />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-muted rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Smile className="w-5 h-5" />
            </button>
          </div>
          <button
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              message.trim()
                ? "gradient-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {message.trim() ? <Send className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
