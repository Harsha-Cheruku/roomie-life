import { useState } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { Home } from "./Home";
import { Tasks } from "./Tasks";
import { Expenses } from "./Expenses";
import { Storage } from "./Storage";
import { Chat } from "./Chat";

const Index = () => {
  const [activeTab, setActiveTab] = useState("home");

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home />;
      case "tasks":
        return <Tasks />;
      case "expenses":
        return <Expenses />;
      case "storage":
        return <Storage />;
      case "chat":
        return <Chat />;
      default:
        return <Home />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {renderContent()}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
