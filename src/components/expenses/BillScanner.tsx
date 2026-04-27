import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';

interface ExtractedItem {
  name: string;
  price: number;
  quantity: number;
}

interface ScanResult {
  title: string;
  items: ExtractedItem[];
  total: number;
}

interface BillScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: (result: ScanResult, imageBase64: string) => void;
}

/**
 * Lightweight image prep for OCR:
 * Just downscale large photos and JPEG-compress so the upload is fast.
 * The AI model handles colour, contrast and noise on its own — heavy
 * grayscale/histogram/unsharp passes added seconds without improving accuracy.
 */
const preprocessForOCR = (dataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      // Cap the longest edge — large photos slow upload + AI processing
      const maxDim = 1280;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG @ 0.8 — small payload, fast OCR, still very readable
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

export const BillScanner = ({ open, onOpenChange, onScanComplete }: BillScannerProps) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' });
      return;
    }

    // Reject huge files early
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 10MB', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const raw = event.target?.result as string;
      // Show preview immediately so the UI is responsive,
      // then run heavy preprocessing without blocking.
      setImagePreview(raw);
      const runHeavy = async () => {
        try {
          const optimized = await preprocessForOCR(raw);
          setImagePreview(optimized);
        } catch {
          // keep raw preview
        } finally {
          setIsProcessing(false);
        }
      };
      // Defer to next idle frame so the preview paints first
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => number);
      if (ric) ric(runHeavy); else setTimeout(runHeavy, 50);
    };
    reader.readAsDataURL(file);
  };

  const scanReceipt = async () => {
    if (!imagePreview) return;

    setIsScanning(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-receipt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ imageBase64: imagePreview }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to scan receipt');

      toast({ title: 'Receipt scanned!', description: `Found ${data.items?.length || 0} items` });
      onScanComplete(data, imagePreview);
      handleClose();
    } catch (error) {
      console.error('Scan error:', error);
      toast({ title: 'Scan failed', description: error instanceof Error ? error.message : 'Could not process receipt', variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleClose = () => {
    setImagePreview(null);
    setIsScanning(false);
    setIsProcessing(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Scan Bill</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {!imagePreview ? (
            <div className="space-y-4">
              <div 
                className="border-2 border-dashed border-primary/30 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Upload Receipt Image</p>
                  <p className="text-sm text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Works with blurry, faded & old bills</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-sm text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <Button variant="outline" className="w-full h-14 rounded-xl gap-3 press-effect" onClick={() => cameraInputRef.current?.click()}>
                <Camera className="w-5 h-5" /> Take Photo
              </Button>

              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={handleFileSelect} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-muted">
                <img src={imagePreview} alt="Receipt preview" className="w-full max-h-[50vh] object-contain" />
                <Button size="icon" variant="secondary" className="absolute top-3 right-3 rounded-full" onClick={() => setImagePreview(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setImagePreview(null)} disabled={isScanning}>Retake</Button>
                <Button className="flex-1 h-12 rounded-xl gap-2" onClick={scanReceipt} disabled={isScanning || isProcessing}>
                  {isScanning ? (<><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>) : isProcessing ? (<><Loader2 className="w-4 h-4 animate-spin" />Optimizing...</>) : (<><Scan className="w-4 h-4" />Scan Receipt</>)}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
