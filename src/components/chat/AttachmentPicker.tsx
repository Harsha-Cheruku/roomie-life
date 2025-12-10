import { useState, useRef } from "react";
import { Paperclip, Image, File, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AttachmentPickerProps {
  userId: string;
  onAttachmentUploaded: (url: string, type: 'image' | 'file' | 'voice', fileName: string) => void;
  disabled?: boolean;
}

export function AttachmentPicker({ userId, onAttachmentUploaded, disabled }: AttachmentPickerProps) {
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File, type: 'image' | 'file') => {
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(fileName);

      onAttachmentUploaded(publicUrl, type, file.name);
      toast.success('File uploaded!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, 'image');
    e.target.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, 'file');
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-12 w-12 rounded-xl"
            disabled={disabled || uploading}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="w-4 h-4 mr-2" />
            Photo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
            <File className="w-4 h-4 mr-2" />
            Document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

interface AttachmentPreviewProps {
  url: string;
  type: 'image' | 'file' | 'voice';
  fileName?: string;
  onRemove?: () => void;
  isPreview?: boolean;
}

export function AttachmentPreview({ url, type, fileName, onRemove, isPreview }: AttachmentPreviewProps) {
  if (type === 'image') {
    return (
      <div className="relative inline-block">
        <img
          src={url}
          alt="Attachment"
          className={`rounded-lg object-cover ${isPreview ? 'max-w-[200px] max-h-[150px]' : 'max-w-[250px] max-h-[200px]'}`}
        />
        {onRemove && (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            onClick={onRemove}
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  if (type === 'voice') {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
        <audio controls src={url} className="h-10 max-w-[200px]" />
        {onRemove && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onRemove}
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
      <File className="w-5 h-5 text-primary" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-primary hover:underline truncate max-w-[150px]"
      >
        {fileName || 'Document'}
      </a>
      {onRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={onRemove}
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}