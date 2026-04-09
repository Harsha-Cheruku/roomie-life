import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

const STICKER_CATEGORIES = [
  { name: "Smileys", stickers: ["😀","😂","🤣","😍","🥰","😎","🤩","😇","🤗","😋","🤔","😏","😴","🥳","😱","🤯","😤","🥺","😭","💀"] },
  { name: "Gestures", stickers: ["👍","👎","👏","🙌","🤝","✌️","🤞","🤟","👊","✊","🫶","🙏","💪","☝️","👋","🤙","🫡","🫣","🤫","🤐"] },
  { name: "Fun", stickers: ["🔥","💯","⭐","❤️","💖","💝","💕","🎉","🎊","✨","💫","🌟","🏆","🎯","🎮","🎲","🎭","🎨","🎵","🎶"] },
  { name: "Food", stickers: ["🍕","🍔","🍟","🌮","🍣","🍩","🍪","☕","🍺","🧃","🥗","🍛","🍜","🫖","🧁","🎂","🍰","🍿","🥐","🍝"] },
];

interface StickerPickerProps {
  onStickerSelect: (sticker: string) => void;
  disabled?: boolean;
}

export const StickerPicker = ({ onStickerSelect, disabled }: StickerPickerProps) => {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl shrink-0" disabled={disabled}>
          <Smile className="w-5 h-5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" side="top" align="start">
        <div className="flex gap-1 mb-2 border-b border-border pb-2">
          {STICKER_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(i)}
              className={cn(
                "text-xs px-2 py-1 rounded-lg transition-colors",
                activeCategory === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-0.5 max-h-40 overflow-y-auto">
          {STICKER_CATEGORIES[activeCategory].stickers.map((sticker) => (
            <button
              key={sticker}
              onClick={() => { onStickerSelect(sticker); setOpen(false); }}
              className="text-2xl p-1 rounded-lg hover:bg-muted transition-colors"
            >
              {sticker}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
