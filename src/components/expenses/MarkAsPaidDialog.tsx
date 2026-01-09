import { useState, useRef } from 'react';
import { Check, Loader2, Upload, Camera, X } from 'lucide-react';
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

interface MarkAsPaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  splitId: string;
  amount: number;
  expenseTitle: string;
  onComplete: () => void;
}

export const MarkAsPaidDialog = ({
  open,
  onOpenChange,
  splitId,
  amount,
  expenseTitle,
  onComplete,
}: MarkAsPaidDialogProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setScreenshot(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      // Upload screenshot if provided
      let screenshotUrl: string | null = null;
      if (screenshot && fileInputRef.current?.files?.[0]) {
        setUploadingScreenshot(true);
        const file = fileInputRef.current.files[0];
        const fileName = `payment_${splitId}_${Date.now()}.${file.name.split('.').pop()}`;
        
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('chat-attachments')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          // Continue even if upload fails
        } else {
          const { data: urlData } = supabase
            .storage
            .from('chat-attachments')
            .getPublicUrl(fileName);
          screenshotUrl = urlData.publicUrl;
        }
        setUploadingScreenshot(false);
      }

      // Mark split as paid
      const { error } = await supabase
        .from('expense_splits')
        .update({ is_paid: true })
        .eq('id', splitId);

      if (error) throw error;

      toast({
        title: 'Payment confirmed! ✓',
        description: screenshotUrl 
          ? 'Payment screenshot saved.' 
          : 'Expense marked as paid.',
      });

      onComplete();
      onOpenChange(false);
      setScreenshot(null);
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
      setScreenshot(null);
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

        {/* Screenshot Upload */}
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

          {screenshot ? (
            <div className="relative">
              <img 
                src={screenshot} 
                alt="Payment screenshot" 
                className="w-full h-40 object-cover rounded-xl border border-border"
              />
              <button
                onClick={() => {
                  setScreenshot(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/80 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">Upload Screenshot (Optional)</span>
            </button>
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
