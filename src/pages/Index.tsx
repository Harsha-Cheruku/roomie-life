import { useNavigate, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/layout/BottomNav";
import { Home } from "./Home";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/tasks') return 'tasks';
    if (path === '/expenses') return 'expenses';
    if (path === '/storage') return 'storage';
    if (path === '/chat') return 'chat';
    return 'home';
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'home') navigate('/');
    else if (tab === 'tasks') navigate('/tasks');
    else if (tab === 'expenses') navigate('/expenses');
    else if (tab === 'storage') navigate('/storage');
    else if (tab === 'chat') navigate('/chat');
  };

  return (
    <div className="min-h-screen bg-background">
      <Home />
      <BottomNav activeTab={getActiveTab()} onTabChange={handleTabChange} />
    </div>
  );
};

export default Index;
