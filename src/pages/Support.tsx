import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LifeBuoy, Plus, Send, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "technical", label: "Technical issue" },
  { value: "account", label: "Account issue" },
  { value: "report", label: "Report user / listing" },
  { value: "bug", label: "App bug" },
  { value: "general", label: "General help" },
];

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: "open" | "pending" | "resolved";
  last_message_at: string;
  created_at: string;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
}

const statusColor: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  resolved: "bg-muted text-muted-foreground",
};

export default function Support() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeId = params.get("t");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadTickets = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false });
    setTickets((data ?? []) as Ticket[]);
    setLoading(false);
  };

  useEffect(() => {
    loadTickets();
    if (!user) return;
    const ch = supabase
      .channel("support-tickets-user")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` }, () => loadTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (activeId) {
    return <TicketThread ticketId={activeId} onBack={() => setParams({})} />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-semibold">Help & Support</h1>
          <p className="text-xs text-muted-foreground">We typically reply within 24 hours</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New
        </Button>
      </header>

      <div className="space-y-3 p-4">
        <Button
          className="w-full justify-start gap-3 h-14 bg-gradient-to-r from-primary to-primary/70"
          onClick={() => setShowCreate(true)}
        >
          <LifeBuoy className="h-5 w-5" /> Contact Support
        </Button>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No tickets yet</p>
            <p className="text-xs text-muted-foreground">Tap Contact Support to start a conversation.</p>
          </div>
        ) : (
          tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setParams({ t: t.id })}
              className="w-full rounded-xl border bg-card p-4 text-left transition hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm line-clamp-1">{t.subject}</p>
                <Badge variant="secondary" className={cn("capitalize", statusColor[t.status])}>{t.status}</Badge>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{CATEGORIES.find(c => c.value === t.category)?.label ?? t.category}</span>
                <span>{new Date(t.last_message_at).toLocaleDateString()}</span>
              </div>
            </button>
          ))
        )}
      </div>

      <CreateTicketDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(id) => { setShowCreate(false); setParams({ t: id }); }}
      />
    </div>
  );
}

function CreateTicketDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void; }) {
  const { user } = useAuth();
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user || !subject.trim() || !body.trim()) return;
    setSubmitting(true);
    const { data, error } = await (supabase as any)
      .from("support_tickets")
      .insert({ user_id: user.id, category, subject: subject.trim() })
      .select("id")
      .single();
    if (error || !data) {
      toast({ title: "Failed to create ticket", description: error?.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }
    const ticketId = data.id as string;
    await (supabase as any)
      .from("support_ticket_messages")
      .insert({ ticket_id: ticketId, sender_id: user.id, is_admin: false, body: body.trim() });
    setSubmitting(false);
    setSubject(""); setBody(""); setCategory("general");
    toast({ title: "Ticket created", description: "Our team will reply soon." });
    onCreated(ticketId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact Support</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Brief summary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Describe the issue</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} placeholder="Tell us what's going on…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !subject.trim() || !body.trim()}>
            {submitting ? "Sending…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketThread({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data: t } = await (supabase as any).from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
    setTicket(t as Ticket);
    const { data: m } = await (supabase as any).from("support_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at");
    setMessages((m ?? []) as Message[]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`support-thread-${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticketId}` }, (p) => {
        setMessages((prev) => prev.some(x => x.id === (p.new as any).id) ? prev : [...prev, p.new as Message]);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, (p) => setTicket(p.new as Ticket))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const send = async () => {
    if (!user || !text.trim() || !ticket) return;
    setSending(true);
    const body = text.trim();
    setText("");
    const { error } = await (supabase as any)
      .from("support_ticket_messages")
      .insert({ ticket_id: ticketId, sender_id: user.id, is_admin: false, body });
    if (error) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
      setText(body);
    }
    setSending(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold">{ticket?.subject ?? "Ticket"}</p>
          <p className="text-xs text-muted-foreground capitalize">{ticket?.category}</p>
        </div>
        {ticket && <Badge variant="secondary" className={cn("capitalize", statusColor[ticket.status])}>{ticket.status}</Badge>}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const mine = m.sender_id === user?.id && !m.is_admin;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                mine ? "bg-primary text-primary-foreground rounded-br-sm" :
                m.is_admin ? "bg-accent text-accent-foreground rounded-bl-sm" :
                "bg-muted text-foreground rounded-bl-sm"
              )}>
                {m.is_admin && <p className="text-[10px] font-semibold opacity-80 mb-0.5">Support team</p>}
                {m.body}
                <p className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {ticket?.status === "resolved" ? (
        <div className="border-t bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          This ticket is resolved. Create a new ticket if you need more help.
        </div>
      ) : (
        <div className="sticky bottom-0 border-t bg-background p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              rows={1}
              className="min-h-[42px] max-h-32 resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <Button size="icon" onClick={send} disabled={sending || !text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}