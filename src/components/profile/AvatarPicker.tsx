import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const AVATAR_OPTIONS = [
  "😎", "😊", "🤩", "😎", "🥳", "🤗", "😇", "🤠",
  "👻", "🦊", "🐱", "🐶", "🐼", "🦁", "🐸", "🦄",
  "🌟", "🔥", "💎", "🎯", "🎨", "🎵", "🚀", "⚡",
  "🌈", "🌸", "🍀", "🌺", "🍕", "☕", "🎮", "🏆",
];

interface AvatarPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAvatar: string;
  onSelect: (avatar: string) => void;
  isLoading?: boolean;
}

export const AvatarPicker = ({
  open,
  onOpenChange,
  currentAvatar,
  onSelect,
  isLoading,
}: AvatarPickerProps) => {
  const [selected, setSelected] = useState(currentAvatar);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-center">Choose Your Avatar</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-8 gap-2 py-2">
          {AVATAR_OPTIONS.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => setSelected(emoji)}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center text-xl transition-all",
                selected === emoji
                  ? "bg-primary/20 ring-2 ring-primary scale-110"
                  : "hover:bg-muted"
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        <Button
          onClick={() => onSelect(selected)}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? "Saving..." : "Save Avatar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
