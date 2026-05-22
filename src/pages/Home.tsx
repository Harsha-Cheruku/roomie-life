import { RoomHeader } from "@/components/home/RoomHeader";
import { QuickActions } from "@/components/home/QuickActions";
import { ExpenseOverview } from "@/components/home/ExpenseOverview";
import { TaskPreview } from "@/components/home/TaskPreview";
import { FloatingActionButton } from "@/components/home/FloatingActionButton";
import { RecentMessagesPreview } from "@/components/home/RecentMessagesPreview";
import { usePendingExpenseCount } from "@/hooks/usePendingExpenseCount";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ArrowRight } from "lucide-react";

export const Home = () => {
  const pendingExpenseCount = usePendingExpenseCount();
  const { isSoloMode } = useAuth();
  const { isAdmin } = useSuperAdmin();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-32">
      <RoomHeader />
      
      <div className="space-y-6">
        {isAdmin && (
          <button
            onClick={() => navigate("/super-admin")}
            className="mx-4 flex w-[calc(100%-2rem)] items-center justify-between rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 text-left transition hover:from-primary/15"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Super Admin Dashboard</p>
                <p className="text-xs text-muted-foreground">Users, tickets, reports & metrics</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <QuickActions pendingExpenseCount={pendingExpenseCount} />
        {!isSoloMode && <RecentMessagesPreview />}
        <ExpenseOverview pendingExpenseCount={pendingExpenseCount} />
        <TaskPreview />
      </div>

      <FloatingActionButton />
    </div>
  );
};
