import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const AVATAR_OPTIONS = [
  "😎", "😊", "🤩", "🥳", "🤗", "😇", "🤠", "🥰",
  "👻", "🦊", "🐱", "🐶", "🐼", "🦁", "🐸", "🦄",
  "🌟", "🔥", "💎", "🎯", "🎨", "🎵", "🚀", "⚡",
  "🌈", "🌸", "🍀", "🌺", "🍕", "☕", "🎮", "🏆",
];

const ALLOWED_TYPES = ["image/jpeg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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
  const { user } = useAuth();
  const [selected, setSelected] = useState(currentAvatar);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isUrl = (val: string) => val.startsWith("http") || val.startsWith("blob:") || val.startsWith("data:");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type - only PNG and JPG
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only JPG and PNG images are allowed");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image must be under 5MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/avatar.${ext}`;

      // Upload (upsert to replace old)
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      // Add cache-buster so the browser shows the new image
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      setPreview(publicUrl);
      setSelected(publicUrl);
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs rounded-3xl p-5">
        <DialogHeader>
          <DialogTitle className="font-display text-center">Choose Your DP</DialogTitle>
        </DialogHeader>

        {/* Current preview */}
        <div className="flex justify-center py-2">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden ring-2 ring-primary/30">
            {isUrl(selected) ? (
              <img src={selected} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">{selected}</span>
            )}
          </div>
        </div>

        <Tabs defaultValue="emoji" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-2">
            <TabsTrigger value="emoji">Emoji</TabsTrigger>
            <TabsTrigger value="photo">Photo</TabsTrigger>
          </TabsList>

          <TabsContent value="emoji">
            <div className="grid grid-cols-8 gap-2 py-1 max-h-40 overflow-y-auto">
              {AVATAR_OPTIONS.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => { setSelected(emoji); setPreview(null); }}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center text-xl transition-all",
                    selected === emoji && !isUrl(selected)
                      ? "bg-primary/20 ring-2 ring-primary scale-110"
                      : "hover:bg-muted"
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="photo">
            <div className="flex flex-col items-center gap-3 py-2">
              {preview && (
                <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-primary/30">
                  <img src={preview} alt="preview" className="w-full h-full object-cover" />
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Camera className="w-4 h-4" /> {preview ? "Change Photo" : "Upload Photo"}</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">JPG or PNG only · Max 5MB</p>
            </div>
          </TabsContent>
        </Tabs>

        <Button
          onClick={() => onSelect(selected)}
          disabled={isLoading || uploading}
          className="w-full"
        >
          {isLoading ? "Saving..." : "Save"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
