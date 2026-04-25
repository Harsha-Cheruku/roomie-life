import { useRef } from "react";
import { cn } from "@/lib/utils";

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];
const INTERACTIVE_TARGET_SELECTOR = 'button, a, input, textarea, select, [role="button"], [data-message-interactive="true"]';
const TAP_MOVE_TOLERANCE = 8;

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
  isOwnMessage, selected, onSelect, onReact, children,
}: MessageActionsMenuProps) => {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const handleBubbleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_TARGET_SELECTOR)) return;

    event.stopPropagation();
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }

    onSelect();
  };

  return (
    <div
      data-message-actions-root="true"
      className={cn(
        "relative flex flex-col",
        selected && !isOwnMessage ? "z-20 pt-12" : "z-0",
        isOwnMessage ? "items-end" : "items-start"
      )}
    >
      {selected && !isOwnMessage && (
        <div
          className="pointer-events-none absolute left-0 top-0 z-30 flex w-max max-w-[calc(100vw-4rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-popover px-2 py-1 shadow-lg animate-in fade-in zoom-in-95">
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
          pointerStartRef.current = { x: event.clientX, y: event.clientY };
          didDragRef.current = false;
        }}
        onPointerMove={(event) => {
          if (!pointerStartRef.current) return;
          const dx = Math.abs(event.clientX - pointerStartRef.current.x);
          const dy = Math.abs(event.clientY - pointerStartRef.current.y);
          if (dx > TAP_MOVE_TOLERANCE || dy > TAP_MOVE_TOLERANCE) didDragRef.current = true;
        }}
        onPointerUp={() => { pointerStartRef.current = null; }}
        onPointerLeave={() => { pointerStartRef.current = null; }}
        onPointerCancel={() => { pointerStartRef.current = null; didDragRef.current = true; }}
      >
        {children}
      </div>
    </div>
  );
};
