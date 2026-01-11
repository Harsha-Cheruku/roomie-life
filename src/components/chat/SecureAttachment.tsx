import { useState, useEffect } from 'react';
import { Loader2, File, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SecureAttachmentProps {
  filePath: string;
  type: 'image' | 'voice' | 'file';
  fileName?: string;
  isOwnMessage?: boolean;
}

export function SecureAttachment({ filePath, type, fileName, isOwnMessage }: SecureAttachmentProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const generateSignedUrl = async () => {
      // Check if this is already a full URL (legacy data or external URL)
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        setSignedUrl(filePath);
        setLoading(false);
        return;
      }

      try {
        const { data, error: urlError } = await supabase.storage
          .from('chat-attachments')
          .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (urlError || !data?.signedUrl) {
          throw new Error('Failed to generate signed URL');
        }

        setSignedUrl(data.signedUrl);
      } catch (err) {
        console.error('Error generating signed URL:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    generateSignedUrl();
  }, [filePath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
        <AlertCircle className="w-4 h-4" />
        <span>Unable to load attachment</span>
      </div>
    );
  }

  if (type === 'image') {
    return (
      <img
        src={signedUrl}
        alt="Image"
        className="max-w-[250px] max-h-[200px] rounded-lg object-cover cursor-pointer"
        onClick={() => window.open(signedUrl, '_blank')}
        onError={() => setError(true)}
      />
    );
  }

  if (type === 'voice') {
    return (
      <audio controls src={signedUrl} className="max-w-[200px]" />
    );
  }

  if (type === 'file') {
    return (
      <a
        href={signedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 text-sm hover:underline",
          isOwnMessage ? "text-primary-foreground" : "text-primary"
        )}
      >
        <File className="w-4 h-4" />
        {fileName || 'Download file'}
      </a>
    );
  }

  return null;
}
