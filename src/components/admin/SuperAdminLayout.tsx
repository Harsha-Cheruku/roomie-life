import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileWarning,
  LifeBuoy,
  Settings,
  LogOut,
  Moon,
  Sun,
  Menu,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const THEME_KEY = "super-admin-theme";

const nav = [
  { to: "/super-admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/super-admin/users", label: "Users", icon: Users },
  { to: "/super-admin/reports", label: "Reports", icon: FileWarning },
  { to: "/super-admin/tickets", label: "Support Tickets", icon: LifeBuoy },
  { to: "/super-admin/native-setup", label: "Native Setup", icon: Smartphone },
  { to: "/super-admin/settings", label: "Settings", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-center gap-2 px-2 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">Super Admin</p>
          <p className="text-xs text-muted-foreground">Control Center</p>
        </div>
      </div>
      <nav className="mt-2 flex flex-1 flex-col gap-1">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function SuperAdminLayout() {
  const { user, signOut } = useAuth();
  const { isAdmin, loading } = useSuperAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(THEME_KEY) === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="animate-pulse text-sm text-muted-foreground">Verifying access…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/super-admin/login" replace state={{ from: location }} />;
  }
  if (!isAdmin) {
    return <Navigate to="/super-admin/login" replace state={{ denied: true }} />;
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <SidebarContent />
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SidebarContent onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <h1 className="text-sm font-semibold md:text-base">Admin Console</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/super-admin/login", { replace: true });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
