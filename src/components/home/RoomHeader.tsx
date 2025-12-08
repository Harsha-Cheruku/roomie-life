import { Bell, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const roommates = [
  { avatar: "😎", name: "You" },
  { avatar: "🎮", name: "Alex" },
  { avatar: "🎵", name: "Sam" },
  { avatar: "📚", name: "Jordan" },
];

export const RoomHeader = () => {
  return (
    <header className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back 👋</p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Room 204
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="glass" size="icon" className="relative">
            <Bell className="w-5 h-5 text-foreground" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-coral rounded-full text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              3
            </span>
          </Button>
          <Button variant="glass" size="icon">
            <Settings className="w-5 h-5 text-foreground" />
          </Button>
        </div>
      </div>

      {/* Roommates Row */}
      <div className="flex items-center gap-2">
        <div className="flex -space-x-3">
          {roommates.map((mate, index) => (
            <div
              key={mate.name}
              className="w-10 h-10 rounded-full bg-card border-2 border-background flex items-center justify-center text-xl shadow-sm animate-scale-in"
              style={{ animationDelay: `${index * 50}ms`, zIndex: roommates.length - index }}
            >
              {mate.avatar}
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="ml-2 text-muted-foreground">
          <Users className="w-4 h-4 mr-1" />
          {roommates.length} Roommates
        </Button>
      </div>
    </header>
  );
};
