import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { FileWarning, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  report_type: string;
  target_type: string | null;
  target_id: string | null;
  reason: string;
  description: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;

const statusColor: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  reviewing: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  dismissed: "bg-muted text-muted-foreground",
};

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string; avatar: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("reports" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: "Failed to load reports", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as Report[];
    setReports(rows);

    const ids = Array.from(new Set(rows.flatMap((r) => [r.reporter_id, r.reported_user_id].filter(Boolean) as string[])));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar")
        .in("user_id", ids);
      const map: Record<string, { display_name: string; avatar: string | null }> = {};
      (profs ?? []).forEach((p: any) => {
        map[p.user_id] = { display_name: p.display_name, avatar: p.avatar };
      });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const payload: any = { status };
    if (status === "resolved" || status === "dismissed") {
      payload.resolved_at = new Date().toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) payload.resolved_by = user.id;
    }
    const { error } = await supabase.from("reports" as any).update(payload).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Marked as ${status}` });
    }
  };

  const saveNotes = async (id: string) => {
    const notes = notesDraft[id] ?? "";
    const { error } = await supabase.from("reports" as any).update({ admin_notes: notes }).eq("id", id);
    if (error) {
      toast({ title: "Failed to save notes", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notes saved" });
    }
  };

  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Reports</h2>
          <p className="text-sm text-muted-foreground">Real-time user-submitted reports</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({reports.length})</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)} ({reports.filter((r) => r.status === s).length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileWarning className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No reports{filter !== "all" ? ` with status "${filter}"` : ""} yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const reporter = profiles[r.reporter_id];
            const reported = r.reported_user_id ? profiles[r.reported_user_id] : null;
            return (
              <Card key={r.id} className="overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <span className="truncate">{r.reason}</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">{r.report_type}</Badge>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${statusColor[r.status] ?? "bg-muted"}`}>
                        {r.status}
                      </span>
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} ·
                      {" "}from {reporter?.display_name ?? r.reporter_id.slice(0, 8)}
                      {reported && <> · against {reported.display_name}</>}
                    </p>
                  </div>
                  <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="space-y-3">
                  {r.description && (
                    <p className="rounded-md bg-muted/40 p-3 text-sm">{r.description}</p>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Admin notes</p>
                    <Textarea
                      rows={2}
                      placeholder="Internal notes…"
                      defaultValue={r.admin_notes ?? ""}
                      onChange={(e) => setNotesDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => saveNotes(r.id)}>Save notes</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}