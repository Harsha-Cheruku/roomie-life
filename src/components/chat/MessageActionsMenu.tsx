import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Copy, Edit2, Trash2, Eye, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

interface MessageActionsMenuProps {
  isOwnMessage: boolean;
  messageContent: string;
  messageType: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewSeen: () => void;
  onReact: (emoji: string) => void;
  children: React.ReactNode;
}

export const MessageActionsMenu = ({
  isOwnMessage, messageContent, messageType, selected, onSelect, onEdit, onDelete, onViewSeen, onReact, children,
}: MessageActionsMenuProps) => {
  const handleCopy = () => {
    if (messageType === "text") {
      navigator.clipboard.writeText(messageContent);
      toast.success("Copied to clipboard");
    }
  };

  return (
    <div className={cn("relative flex flex-col", isOwnMessage ? "items-end" : "items-start")}>
      {selected && (
        <div
          className={cn(
            "z-20 mb-1.5 flex items-center gap-1 rounded-full border border-border/60 bg-popover px-2 py-1 shadow-lg animate-in fade-in zoom-in-95",
          )}
        >
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
              className="text-lg leading-none transition-transform hover:scale-125 active:scale-110"
            >
              {emoji}
            </button>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
                aria-label="More actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwnMessage ? "end" : "start"} className="w-40">
              {messageType === "text" && (
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" /> Copy
                </DropdownMenuItem>
              )}
              {isOwnMessage && (
                <DropdownMenuItem onClick={onViewSeen}>
                  <Eye className="w-4 h-4 mr-2" /> Seen by
                </DropdownMenuItem>
              )}
              {isOwnMessage && messageType === "text" && (
                <DropdownMenuItem onClick={onEdit}>
                  <Edit2 className="w-4 h-4 mr-2" /> Edit
                </DropdownMenuItem>
              )}
              {isOwnMessage && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div
        className={cn("cursor-pointer transition-all", selected && "ring-2 ring-primary/40 rounded-[1.6rem]")}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        {children}
      </div>
    </div>
  );
};
