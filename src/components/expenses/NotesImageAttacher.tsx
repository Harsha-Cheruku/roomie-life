import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface NotesImageAttacherProps {
  /** Storage path within the chat-attachments bucket (e.g. `<uid>/notes/abc.jpg`) */
  value: string | null;
  onChange: (path: string | null) => void;
  /** Bind paste-to-attach to this textarea so users can paste screenshots from clipboard. */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

const BUCKET = "chat-attachments";

export const NotesImageAttacher = ({ value, onChange, textareaRef }: NotesImageAttacherProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(value, 60 * 60);
        if (!revoked && !error && data?.signedUrl) setPreviewUrl(data.signedUrl);
      } catch {/* ignore */}
    })();
    return () => { revoked = true; };
  }, [value]);

  const uploadBlob = async (blob: Blob, suggestedName?: string) => {
    if (!user) {
      toast({ title: "Sign in to attach images", variant: "destructive" });
      return;
    }
    if (blob.size > 8 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 8MB", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const ext = (suggestedName?.split(".").pop() || blob.type.split("/")[1] || "jpg").toLowerCase();
      const path = `${user.id}/notes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      onChange(path);
      toast({ title: "Image attached" });
    } catch (e) {
      console.error(e);
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({ title: "Pick an image file", variant: "destructive" });
      return;
    }
    await uploadBlob(f, f.name);
  };

  const pasteFromClipboard = async () => {
    try {
      // Modern Clipboard API (works in secure contexts; supported in Chrome/Android WebView)
      const items = await (navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItem[]> }).read?.();
      if (items) {
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            await uploadBlob(blob, `pasted.${imgType.split("/")[1] || "png"}`);
            return;
          }
        }
      }
      toast({ title: "No image in clipboard", description: "Copy a screenshot first, then tap Paste." });
    } catch (err) {
      console.error(err);
      toast({
        title: "Clipboard blocked",
        description: "Use the Pick from Gallery option, or paste directly into the notes field.",
        variant: "destructive",
      });
    }
  };

  // Allow paste-to-attach directly inside the linked textarea
  useEffect(() => {
    const el = textareaRef?.current;
    if (!el) return;
    const handler = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const blob = it.getAsFile();
          if (blob) {
            e.preventDefault();
            await uploadBlob(blob, blob.name || `pasted.${it.type.split("/")[1] || "png"}`);
          }
          return;
        }
      }
    };
    el.addEventListener("paste", handler);
    return () => el.removeEventListener("paste", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textareaRef?.current, user?.id]);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5 h-9"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          Add screenshot
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full gap-1.5 h-9"
          disabled={busy}
          onClick={pasteFromClipboard}
        >
          <ClipboardPaste className="w-4 h-4" />
          Paste
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />
      </div>

      {value && (
        <div className="relative inline-block">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Note attachment"
              className="rounded-xl max-h-40 border border-border object-cover"
            />
          ) : (
            <div className="w-32 h-32 rounded-xl bg-muted flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
            aria-label="Remove image"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: from another app, share a screenshot to RoomMate or copy it, then tap Paste.
      </p>
    </div>
  );
};
