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
 * Advanced image preprocessing for OCR:
 * 1. Scale to optimal range (800–1600px)
 * 2. Convert to grayscale
 * 3. Apply contrast stretching (adaptive)
 * 4. Sharpen via unsharp-mask convolution
 */
const preprocessForOCR = (dataUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale to optimal OCR range
      const maxDim = 1800;
      const minDim = 900;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      if (width < minDim && height < minDim) {
        const upscale = Math.min(2.5, minDim / Math.max(width, height));
        width = Math.round(width * upscale);
        height = Math.round(height * upscale);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Step 1: Convert to grayscale (luminance-preserving)
        for (let i = 0; i < data.length; i += 4) {
          const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        // Step 2: Histogram-based adaptive contrast stretching
        const histogram = new Uint32Array(256);
        for (let i = 0; i < data.length; i += 4) {
          histogram[data[i]]++;
        }
        const totalPixels = width * height;
        const clipLow = totalPixels * 0.01;
        const clipHigh = totalPixels * 0.99;
        let cumulative = 0;
        let minVal = 0;
        let maxVal = 255;
        for (let i = 0; i < 256; i++) {
          cumulative += histogram[i];
          if (cumulative >= clipLow && minVal === 0) minVal = i;
          if (cumulative >= clipHigh) { maxVal = i; break; }
        }
        const range = Math.max(maxVal - minVal, 1);
        for (let i = 0; i < data.length; i += 4) {
          const stretched = Math.round(((data[i] - minVal) / range) * 255);
          const clamped = Math.min(255, Math.max(0, stretched));
          data[i] = clamped;
          data[i + 1] = clamped;
          data[i + 2] = clamped;
        }

        // Step 3: Unsharp mask sharpening
        // Create a blurred copy first
        ctx.putImageData(imageData, 0, 0);
        const sharpCanvas = document.createElement('canvas');
        sharpCanvas.width = width;
        sharpCanvas.height = height;
        const sharpCtx = sharpCanvas.getContext('2d')!;
        // Draw blurred version
        sharpCtx.filter = 'blur(1px)';
        sharpCtx.drawImage(canvas, 0, 0);
        const blurredData = sharpCtx.getImageData(0, 0, width, height).data;

        // Unsharp: original + strength * (original - blurred)
        const strength = 0.6;
        const finalData = ctx.getImageData(0, 0, width, height);
        const fd = finalData.data;
        for (let i = 0; i < fd.length; i += 4) {
          const diff = fd[i] - blurredData[i];
          const sharpened = Math.round(fd[i] + strength * diff);
          const v = Math.min(255, Math.max(0, sharpened));
          fd[i] = v;
          fd[i + 1] = v;
          fd[i + 2] = v;
        }
        ctx.putImageData(finalData, 0, 0);
      } catch {
        // Canvas tainted — send as-is
      }

      resolve(canvas.toDataURL('image/jpeg', 0.92));
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
