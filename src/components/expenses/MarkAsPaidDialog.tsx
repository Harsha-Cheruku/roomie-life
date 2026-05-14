import { useState, useRef, useEffect } from 'react';
import { Check, Loader2, Upload, X, ClipboardPaste, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateNotification } from '@/hooks/useCreateNotification';
import { useNavigate } from 'react-router-dom';

interface MarkAsPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splitId: string;
  amount: number;
  expenseId: string;
  expenseTitle: string;
  expensePaidBy: string;
  onComplete: () => void;
}

export const MarkAsPaidDialog = ({
  open,
  onOpenChange,
  splitId,
  amount,
  expenseId,
  expenseTitle,
  expensePaidBy,
  onComplete,
}: MarkAsPaidDialogProps) => {
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { createExpensePaidNotification } = useCreateNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptBlob = (blob: Blob) => {
    if (!blob.type.startsWith('image/')) {
      toast({ title: 'Pick an image', variant: 'destructive' });
      return;
    }
    if (blob.size > 10 * 1024 * 1024) {
      toast({ title: 'Too large', description: 'Max 10MB', variant: 'destructive' });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(blob));
    setPendingBlob(blob);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    acceptBlob(file);
  };

  const pasteFromClipboard = async () => {
    try {
      const items = await (navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItem[]> }).read?.();
      if (items) {
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            acceptBlob(blob);
            return;
          }
        }
      }
      toast({ title: 'No image in clipboard' });
    } catch {
      toast({
        title: 'Clipboard blocked',
        description: 'Tap Upload, or share a screenshot to RoomMate from another app.',
        variant: 'destructive',
      });
    }
  };

  const shareFromOtherApp = () => {
    // Stash the target split so ShareImport can hand the image straight back to us
    sessionStorage.setItem(
      'roommate_pending_payment_split',
      JSON.stringify({ splitId, expenseId, expenseTitle, amount, expensePaidBy, ts: Date.now() })
    );
    onOpenChange(false);
    toast({
      title: 'Switch to the other app',
      description: 'Open the screenshot, tap Share → RoomMate. We\'ll bring it back here.',
    });
  };

  // Pick up an image stashed by ShareImport (user shared a screenshot from another app)
  useEffect(() => {
    if (!open) return;
    const dataUrl = sessionStorage.getItem('roommate_pending_payment_image');
    if (!dataUrl) return;
    sessionStorage.removeItem('roommate_pending_payment_image');
    fetch(dataUrl)
      .then((r) => r.blob())
      .then(acceptBlob)
      .catch(() => {/* ignore */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      let screenshotPath: string | null = null;
      if (pendingBlob && user) {
        setUploadingScreenshot(true);
        const ext = (pendingBlob.type.split('/')[1] || 'jpg').toLowerCase();
        const path = `${user.id}/payments/${splitId}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase
          .storage
          .from('chat-attachments')
          .upload(path, pendingBlob, { contentType: pendingBlob.type, upsert: false });
        if (uploadError) {
          console.error('Upload error:', uploadError);
        } else {
          screenshotPath = path;
        }
        setUploadingScreenshot(false);
      }

      // Mark split as paid (and store screenshot path if we have one)
      const updatePayload: { is_paid: boolean; payment_screenshot_url?: string | null } = { is_paid: true };
      if (screenshotPath) updatePayload.payment_screenshot_url = screenshotPath;
      const { error } = await supabase
        .from('expense_splits')
        .update(updatePayload)
        .eq('id', splitId);

      if (error) throw error;
      
      // Check if all splits for this expense are paid - auto settle
      const { data: allSplits } = await supabase
        .from('expense_splits')
        .select('id, is_paid, status')
        .eq('expense_id', expenseId);
      
      const allPaid = allSplits?.every(s => s.is_paid || s.status === 'rejected');
      
      if (allPaid) {
        // Auto-settle the expense
        await supabase
          .from('expenses')
          .update({ status: 'settled' })
          .eq('id', expenseId);
      }

      // Create notification for the person who originally paid
      const userName = profile?.display_name || 'Someone';
      await createExpensePaidNotification(
        { id: expenseId, title: expenseTitle, paid_by: expensePaidBy },
        userName,
        amount
      );

      toast({
        title: 'Payment confirmed! ✓',
        description: screenshotPath
          ? 'Payment screenshot saved.' 
          : 'Expense marked as paid.',
      });

      onComplete();
      onOpenChange(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPendingBlob(null);
    } catch (error) {
      console.error('Error marking as paid:', error);
      toast({
        title: 'Failed to confirm payment',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onOpenChange(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPendingBlob(null);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-sm rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">Confirm Payment</AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            Have you completed the payment of <span className="font-bold text-foreground">₹{amount.toFixed(0)}</span> for "{expenseTitle}"?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Optionally attach payment screenshot for proof:
          </p>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {previewUrl ? (
            <div className="relative">
              <img 
                src={previewUrl}
                alt="Payment screenshot" 
                className="w-full h-40 object-cover rounded-xl border border-border"
              />
              <button
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setPendingBlob(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span className="text-xs">Pick from gallery / files</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={pasteFromClipboard}>
                  <ClipboardPaste className="w-4 h-4" /> Paste
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={shareFromOtherApp}>
                  <Share2 className="w-4 h-4" /> From other app
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Tip: in any app, share a screenshot to RoomMate — it'll come straight back here.
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 gap-2 bg-mint hover:bg-mint/90"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {uploadingScreenshot ? 'Uploading...' : 'Confirm Paid'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
