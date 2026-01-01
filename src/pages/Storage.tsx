import { useState } from "react";
import { Folder, Image, FileText, Film, Upload, Plus, MoreVertical, Grid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";

interface StorageItem {
  id: string;
  name: string;
  type: "folder" | "image" | "document" | "video";
  size?: string;
  items?: number;
  thumbnail?: string;
  uploadedBy: string;
  avatar: string;
  date: string;
}

const mockItems: StorageItem[] = [
  { id: "1", name: "Room Photos", type: "folder", items: 24, uploadedBy: "Alex", avatar: "🎮", date: "Dec 5" },
  { id: "2", name: "Bills & Receipts", type: "folder", items: 12, uploadedBy: "You", avatar: "😎", date: "Dec 3" },
  { id: "3", name: "Kitchen Renovation.jpg", type: "image", size: "2.4 MB", uploadedBy: "Sam", avatar: "🎵", date: "Dec 7" },
  { id: "4", name: "Rent Agreement.pdf", type: "document", size: "1.2 MB", uploadedBy: "Jordan", avatar: "📚", date: "Nov 20" },
  { id: "5", name: "House Party.mp4", type: "video", size: "156 MB", uploadedBy: "Alex", avatar: "🎮", date: "Dec 1" },
  { id: "6", name: "WiFi Setup Guide.pdf", type: "document", size: "450 KB", uploadedBy: "You", avatar: "😎", date: "Nov 15" },
];

const typeIcons = {
  folder: Folder,
  image: Image,
  document: FileText,
  video: Film,
};

const typeColors = {
  folder: "bg-accent/20 text-accent",
  image: "bg-mint/20 text-mint",
  document: "bg-coral/20 text-coral",
  video: "bg-lavender/20 text-lavender",
};

export const Storage = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const navigate = useNavigate();
  const usedStorage = 2.4;
  const totalStorage = 10;

  const handleTabChange = (tab: string) => {
    if (tab === 'home') navigate('/');
    else if (tab === 'tasks') navigate('/tasks');
    else if (tab === 'expenses') navigate('/expenses');
    else if (tab === 'storage') navigate('/storage');
    else if (tab === 'chat') navigate('/chat');
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header with TopBar */}
      <TopBar 
        title="Storage" 
        showBack={true}
        onBack={() => navigate('/')}
        hint="Share files with your roommates 📁"
        rightContent={
          <Button variant="gradient" size="sm" className="gap-2 press-effect">
            <Upload className="w-4 h-4" />
            Upload
          </Button>
        }
      />

      {/* Storage Usage Card */}
      <div className="px-4 mb-6">
        <div className="bg-card rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-muted-foreground">Room Storage</p>
              <p className="text-lg font-bold text-foreground">
                {usedStorage} GB <span className="text-muted-foreground font-normal">/ {totalStorage} GB</span>
              </p>
            </div>
            <div className="w-12 h-12 gradient-ocean rounded-xl flex items-center justify-center">
              <Folder className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full gradient-primary rounded-full transition-all duration-500"
              style={{ width: `${(usedStorage / totalStorage) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{((usedStorage / totalStorage) * 100).toFixed(0)}% used</span>
            <span>{(totalStorage - usedStorage).toFixed(1)} GB free</span>
          </div>
        </div>
      </div>

      {/* Quick Folders */}
      <section className="px-4 mb-6">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[
            { icon: Image, label: "Images", count: 48, color: "bg-mint" },
            { icon: FileText, label: "Docs", count: 23, color: "bg-coral" },
            { icon: Film, label: "Videos", count: 8, color: "bg-lavender" },
          ].map((item, index) => (
            <div
              key={item.label}
              className={cn(
                "flex-shrink-0 rounded-2xl p-4 min-w-[100px] text-primary-foreground animate-scale-in",
                item.color
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <item.icon className="w-6 h-6 mb-2" />
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-xs opacity-80">{item.count} files</p>
            </div>
          ))}
        </div>
      </section>

      {/* View Toggle */}
      <div className="px-4 flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-foreground">All Files</h2>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "p-2 rounded-md transition-all",
              viewMode === "grid" ? "bg-card shadow-sm" : "text-muted-foreground"
            )}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-2 rounded-md transition-all",
              viewMode === "list" ? "bg-card shadow-sm" : "text-muted-foreground"
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Files Grid */}
      {viewMode === "grid" ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {mockItems.map((item, index) => {
            const Icon = typeIcons[item.type];
            return (
              <div
                key={item.id}
                className="bg-card rounded-2xl p-4 shadow-card animate-scale-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-3", typeColors[item.type])}>
                  <Icon className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">
                    {item.type === "folder" ? `${item.items} items` : item.size}
                  </span>
                  <span className="text-lg">{item.avatar}</span>
                </div>
              </div>
            );
          })}
          <button className="bg-muted/50 border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <Plus className="w-8 h-8" />
            <span className="text-sm font-medium">New Folder</span>
          </button>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {mockItems.map((item, index) => {
            const Icon = typeIcons[item.type];
            return (
              <div
                key={item.id}
                className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 animate-slide-up"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", typeColors[item.type])}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg">{item.avatar}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.type === "folder" ? `${item.items} items` : item.size}
                    </span>
                    <span className="text-xs text-muted-foreground">• {item.date}</span>
                  </div>
                </div>
                <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <BottomNav activeTab="storage" onTabChange={handleTabChange} />
    </div>
  );
};
