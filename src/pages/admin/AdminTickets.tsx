import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, ArrowLeft, Search, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Ticket {
  id: string; user_id: string; subject: string; category: string;
  status: "open" | "pending" | "resolved"; last_message_at: string; created_at: string;
}
interface Message {
  id: string; ticket_id: string; sender_id: string; is_admin: boolean; body: string; created_at: string;
}
interface Profile { user_id: string; display_name: string; avatar: string | null; }

const statusColor: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  resolved: "bg-muted text-muted-foreground",
};

const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical", account: "Account", report: "Report", bug: "Bug", general: "General",
};

export default function AdminTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("support_tickets")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(500);
    const list = (data ?? []) as Ticket[];
    setTickets(list);
    // Only query profiles we don't already have to avoid repeated reads.
    const needed = Array.from(new Set(list.map(t => t.user_id))).filter(id => !profiles[id]);
    if (needed.length) {
      const { data: ps } = await supabase.from("profiles").select("user_id,display_name,avatar").in("user_id", needed);
      if (ps?.length) {
        setProfiles(prev => {
          const next = { ...prev };
          (ps as any[]).forEach((p) => { next[p.user_id] = p; });
          return next;
        });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, (payload) => {
        // Apply incremental change instead of refetching the full list.
        setTickets(prev => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Ticket;
            if (prev.some(t => t.id === row.id)) return prev;
            return [row, ...prev].slice(0, 500);
          }
          if (payload.eventType === "UPDATE") {
            const row = payload.new as Ticket;
            const next = prev.map(t => (t.id === row.id ? row : t));
            // Keep sorted by last_message_at desc
            next.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
            return next;
          }
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as any)?.id;
            return prev.filter(t => t.id !== oldId);
          }
          return prev;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = profiles[t.user_id]?.display_name?.toLowerCase() ?? "";
      if (!t.subject.toLowerCase().includes(q) && !name.includes(q)) return false;
    }
    return true;
  });

  const active = tickets.find(t => t.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Support Tickets</h2>
          <p className="text-sm text-muted-foreground">Reply to user inquiries in real time</p>
        </div>
        <Badge variant="secondary" className="gap-1"><LifeBuoy className="h-3 w-3" /> {tickets.filter(t => t.status !== "resolved").length} active</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-xl border bg-card">
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            {loading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No tickets.</p>
            ) : filtered.map(t => {
              const p = profiles[t.user_id];
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "w-full border-b p-3 text-left transition hover:bg-muted",
                    activeId === t.id && "bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p?.display_name ?? "User"} · {CATEGORY_LABEL[t.category] ?? t.category}
                      </p>
                    </div>
                    <Badge variant="secondary" className={cn("capitalize text-[10px]", statusColor[t.status])}>{t.status}</Badge>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">{new Date(t.last_message_at).toLocaleString()}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border bg-card min-h-[400px]">
          {active ? (
            <AdminThread ticket={active} profile={profiles[active.user_id]} onBack={() => setActiveId(null)} />
          ) : (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <LifeBuoy className="h-10 w-10 mb-2" />
              <p className="text-sm">Select a ticket to view the conversation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminThread({ ticket, profile, onBack }: { ticket: Ticket; profile?: Profile; onBack: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(ticket.status);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setStatus(ticket.status); }, [ticket.status]);

  const load = async () => {
    const { data } = await (supabase as any)
      .from("support_ticket_messages")
      .select("*").eq("ticket_id", ticket.id).order("created_at");
    setMessages((data ?? []) as Message[]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`admin-thread-${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${ticket.id}` }, (p) => {
        setMessages(prev => prev.some(x => x.id === (p.new as any).id) ? prev : [...prev, p.new as Message]);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  const send = async () => {
    if (!user || !text.trim()) return;
    setSending(true);
    const body = text.trim(); setText("");
    const { error } = await (supabase as any)
      .from("support_ticket_messages")
      .insert({ ticket_id: ticket.id, sender_id: user.id, is_admin: true, body });
    if (error) { toast({ title: "Failed to send", description: error.message, variant: "destructive" }); setText(body); }
    setSending(false);
  };

  const changeStatus = async (next: string) => {
    setStatus(next as any);
    const { error } = await (supabase as any)
      .from("support_tickets").update({ status: next }).eq("id", ticket.id);
    if (error) toast({ title: "Failed to update status", variant: "destructive" });
    else toast({ title: `Marked as ${next}` });
  };

  return (
    <div className="flex h-full max-h-[calc(100vh-180px)] flex-col">
      <div className="flex items-center gap-3 border-b p-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold">{ticket.subject}</p>
          <p className="truncate text-xs text-muted-foreground">
            {profile?.display_name ?? "User"} · {CATEGORY_LABEL[ticket.category] ?? ticket.category}
          </p>
        </div>
        <Select value={status} onValueChange={changeStatus}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map(m => {
          const admin = m.is_admin;
          return (
            <div key={m.id} className={cn("flex", admin ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                admin ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
              )}>
                <p className="text-[10px] font-semibold opacity-80 mb-0.5">{admin ? "You (Support)" : profile?.display_name ?? "User"}</p>
                {m.body}
                <p className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Type your reply…" rows={1}
            className="min-h-[42px] max-h-32 resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Button size="icon" onClick={send} disabled={sending || !text.trim()}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}