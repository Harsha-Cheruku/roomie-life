import { useEffect, useState } from "react";
import { Users, UserCheck, FileWarning, LifeBuoy, MessageSquare, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  total_users: number;
  active_users: number;
  total_rooms: number;
  total_messages: number;
}

const cards = [
  { key: "total_users", label: "Total Users", icon: Users, accent: "from-violet-500/20 to-violet-500/0" },
  { key: "active_users", label: "Active (7d)", icon: UserCheck, accent: "from-emerald-500/20 to-emerald-500/0" },
  { key: "total_rooms", label: "Reports", icon: FileWarning, accent: "from-amber-500/20 to-amber-500/0" },
  { key: "total_messages", label: "Support Tickets", icon: LifeBuoy, accent: "from-sky-500/20 to-sky-500/0" },
] as const;

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_admin_stats" as any);
      if (!error && data) setStats(data as unknown as Stats);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground">Real-time platform metrics</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          const value = stats ? (stats[c.key] ?? 0) : null;
          return (
            <Card key={c.key} className="relative overflow-hidden">
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.accent}`} />
              <CardHeader className="relative flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {c.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="relative">
                {loading || value === null ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <p className="text-3xl font-bold">{value.toLocaleString()}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="h-4 w-4" /> Rooms
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p className="text-2xl font-semibold">{stats?.total_rooms?.toLocaleString() ?? 0}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Total rooms created</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" /> Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p className="text-2xl font-semibold">{stats?.total_messages?.toLocaleString() ?? 0}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">All-time messages</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
