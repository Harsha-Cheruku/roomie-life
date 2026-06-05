import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, Loader2, Scan, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useReceiptUpload, compressReceiptImage } from '@/hooks/useReceiptUpload';

interface ExtractedItem {
  name: string;
  price: number;
  quantity: number;
}

interface ScanResult {
  title: string;
  items: ExtractedItem[];
  adjustments?: Array<{ label: string; amount: number; type: 'tax' | 'fee' | 'discount' }>;
  total: number;
}

interface BillScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanComplete: (result: ScanResult, imageBase64: string) => void;
}

export const BillScanner = ({ open, onOpenChange, onScanComplete }: BillScannerProps) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraCapturePendingRef = useRef(false);
  const { toast } = useToast();
  const { scan, setBlob, isScanning, remaining, monthlyLimit } = useReceiptUpload();

  useEffect(() => {
    if (!open) return;
    try {
      const pending = sessionStorage.getItem('roommate_pending_bill_image');
      if (pending) {
        sessionStorage.removeItem('roommate_pending_bill_image');
        setImagePreview(pending);
      }
    } catch {/* ignore */}
  }, [open]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      cameraCapturePendingRef.current = false;
      return;
    }
    cameraCapturePendingRef.current = false;
    setCaptureError(null);
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 10MB', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const raw = event.target?.result as string;
      setImagePreview(raw);
      setBlob(file);
      const runHeavy = async () => {
        try {
          const { dataUrl, blob } = await compressReceiptImage(file);
          setImagePreview(dataUrl);
          if (blob && blob.size > 0) setBlob(blob);
        } catch { /* keep raw */ } finally {
          setIsProcessing(false);
        }
      };
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void) => number);
      if (ric) ric(runHeavy); else setTimeout(runHeavy, 50);
    };
    reader.readAsDataURL(file);
  };

  const scanReceipt = async () => {
    if (!imagePreview) return;
    if (remaining <= 0) {
      const msg = `Monthly scan limit reached (${monthlyLimit}/month). Resets next month.`;
      setScanError(msg);
      toast({ title: 'Limit reached', description: msg, variant: 'destructive' });
      return;
    }
    setScanError(null);
    try {
      const data = await scan();
      if (!data.items || data.items.length === 0) {
        throw new Error("Couldn't read any items from this photo");
      }
      toast({ title: 'Receipt scanned!', description: `Found ${data.items.length} items` });
      onScanComplete(data as ScanResult, imagePreview);
      handleClose();
    } catch (error) {
      console.error('Scan error:', error);
      const msg = error instanceof Error
        ? (error.name === 'AbortError'
            ? 'Request timed out — check your connection and try again.'
            : error.message)
        : 'Could not process receipt';
      setScanError(msg);
      toast({ title: 'Scan failed', description: msg, variant: 'destructive' });
    }
  };

  const handleClose = () => {
    setImagePreview(null);
    setBlob(null);
    setIsProcessing(false);
    setScanError(null);
    setCaptureError(null);
    onOpenChange(false);
  };

  const startCameraCapture = () => {
    setCaptureError(null);
    setScanError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    cameraCapturePendingRef.current = true;
    cameraInputRef.current?.click();
  };

  const startUpload = () => {
    setCaptureError(null);
    setScanError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  };

  const retakePhoto = () => { setImagePreview(null); setScanError(null); startCameraCapture(); };
  const chooseDifferent = () => { setImagePreview(null); setScanError(null); startUpload(); };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">Scan Bill</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <p className="text-xs text-muted-foreground text-center">
            {remaining} of {monthlyLimit} scans remaining this month
          </p>

          {!imagePreview ? (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-primary/30 rounded-2xl p-12 flex flex-col items-center justify-center gap-4 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={startUpload}
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

              {captureError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Camera did not return a photo</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{captureError}</p>
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full h-14 rounded-xl gap-3 press-effect" onClick={startCameraCapture}>
                <Camera className="w-5 h-5" /> Take Photo
              </Button>
              {captureError && (
                <Button variant="secondary" className="w-full h-12 rounded-xl gap-2" onClick={startUpload}>
                  <Upload className="w-4 h-4" /> Use Upload Option
                </Button>
              )}

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

              {scanError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-destructive">Couldn't read this photo</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{scanError}. Try a clearer, well-lit photo with the full receipt in frame.</p>
                  </div>
                </div>
              )}

              {scanError ? (
                <div className="space-y-2">
                  <Button className="w-full h-12 rounded-xl gap-2" onClick={scanReceipt} disabled={isScanning || isProcessing}>
                    {isScanning ? (<><Loader2 className="w-4 h-4 animate-spin" />Trying again...</>) : (<><RotateCcw className="w-4 h-4" />Try again</>)}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-12 rounded-xl gap-2" onClick={retakePhoto} disabled={isScanning}>
                      <Camera className="w-4 h-4" /> Retake
                    </Button>
                    <Button variant="outline" className="flex-1 h-12 rounded-xl gap-2" onClick={chooseDifferent} disabled={isScanning}>
                      <Upload className="w-4 h-4" /> Choose another
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 h-12 rounded-xl" onClick={() => setImagePreview(null)} disabled={isScanning}>Retake</Button>
                  <Button className="flex-1 h-12 rounded-xl gap-2" onClick={scanReceipt} disabled={isScanning || isProcessing}>
                    {isScanning ? (<><Loader2 className="w-4 h-4 animate-spin" />Scanning...</>) : isProcessing ? (<><Loader2 className="w-4 h-4 animate-spin" />Optimizing...</>) : (<><Scan className="w-4 h-4" />Scan Receipt</>)}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
