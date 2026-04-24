import { useRef } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Copy, Edit2, Trash2, Eye, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];
const LONG_PRESS_MS = 280;
const INTERACTIVE_TARGET_SELECTOR = 'button, a, input, textarea, select, [role="button"], [data-message-interactive="true"]';

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
  const pressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handleCopy = () => {
    if (messageType === "text") {
      navigator.clipboard.writeText(messageContent);
      toast.success("Copied to clipboard");
    }
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const startSelectionPress = () => {
    clearPressTimer();
    longPressTriggeredRef.current = false;
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (!selected) onSelect();
    }, LONG_PRESS_MS);
  };

  const handleBubbleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_TARGET_SELECTOR)) return;

    event.stopPropagation();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    onSelect();
  };

  return (
    <div
      data-message-actions-root="true"
      className={cn(
        "relative flex flex-col",
        selected ? "z-20 pt-12" : "z-0",
        isOwnMessage ? "items-end" : "items-start"
      )}
    >
      {selected && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-30 flex w-full",
            isOwnMessage ? "right-0" : "left-0",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={cn(
              "pointer-events-auto flex max-w-[min(92vw,23rem)] items-center gap-1 overflow-x-auto rounded-full border border-border/60 bg-popover px-2 py-1 shadow-lg animate-in fade-in zoom-in-95",
              isOwnMessage ? "ml-auto" : "mr-auto",
            )}
          >
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => { e.stopPropagation(); onReact(emoji); }}
                aria-pressed={false}
                aria-label={`React with ${emoji}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-110 hover:bg-muted active:scale-95"
              >
                {emoji}
              </button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-primary/20 transition-colors hover:bg-muted/80"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isOwnMessage ? "end" : "start"} className="w-40" data-message-actions-dropdown="true">
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
        </div>
      )}
      <div
        className={cn("cursor-pointer rounded-[1.6rem] transition-all", selected && "ring-2 ring-primary/40 shadow-md")}
        onClick={handleBubbleClick}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!selected) onSelect();
        }}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest(INTERACTIVE_TARGET_SELECTOR)) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          startSelectionPress();
        }}
        onPointerUp={clearPressTimer}
        onPointerLeave={clearPressTimer}
        onPointerCancel={clearPressTimer}
      >
        {children}
      </div>
    </div>
  );
};
