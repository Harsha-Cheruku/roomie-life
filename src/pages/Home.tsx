import { RoomHeader } from "@/components/home/RoomHeader";
import { QuickActions } from "@/components/home/QuickActions";
import { ExpenseOverview } from "@/components/home/ExpenseOverview";
import { TaskPreview } from "@/components/home/TaskPreview";
import { FloatingActionButton } from "@/components/home/FloatingActionButton";
import { RecentMessagesPreview } from "@/components/home/RecentMessagesPreview";

export const Home = () => {
  return (
    <div className="min-h-screen bg-background pb-32">
      <RoomHeader />
      
      <div className="space-y-6">
        <QuickActions />
        <RecentMessagesPreview />
        <ExpenseOverview />
        <TaskPreview />
      </div>

      <FloatingActionButton />
    </div>
  );
};
