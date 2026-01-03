import { BottomNav } from "@/components/layout/BottomNav";
import { Home } from "./Home";
import { useNavigation } from "@/hooks/useNavigation";

const Index = () => {
  const { activeTab, navigateToTab } = useNavigation();

  return (
    <div className="min-h-screen bg-background">
      <Home />
      <BottomNav activeTab={activeTab} onTabChange={navigateToTab} />
    </div>
  );
};

export default Index;
