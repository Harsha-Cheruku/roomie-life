import { useCallback, useRef, useState } from 'react';

/**
 * Receipt OCR upload hook.
 * - Client-side compression: downscale longest edge to 1024px and transcode to WebP.
 * - Monthly cap: hard-limits scans to 20 per calendar month per device (localStorage).
 * - Backend uses the cost-effective `google/gemini-2.5-flash-lite` model.
 */

const MAX_DIM = 1024;
const MONTHLY_LIMIT = 20;
const QUOTA_KEY = 'roommate_receipt_scan_quota_v1';

interface QuotaState { month: string; count: number }

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
};

const readQuota = (): QuotaState => {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (!raw) return { month: currentMonthKey(), count: 0 };
    const parsed = JSON.parse(raw) as QuotaState;
    if (parsed.month !== currentMonthKey()) return { month: currentMonthKey(), count: 0 };
    return parsed;
  } catch { return { month: currentMonthKey(), count: 0 }; }
};

const writeQuota = (q: QuotaState) => {
  try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch { /* ignore */ }
};

export const compressReceiptImage = (file: File | Blob): Promise<{ blob: Blob; dataUrl: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, width, height);
        // WebP @ 0.8 — visually equivalent to JPEG 0.85 but ~25-35% smaller.
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Encode failed'));
            const dataUrl = canvas.toDataURL('image/webp', 0.8);
            resolve({ blob, dataUrl });
          },
          'image/webp',
          0.8,
        );
      };
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = src;
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(file);
  });
};

export interface ReceiptScanResult {
  title: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  adjustments?: Array<{ label: string; amount: number; type: 'tax' | 'fee' | 'discount' }>;
  total: number;
}

export const useReceiptUpload = () => {
  const [isCompressing, setIsCompressing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [quota, setQuota] = useState<QuotaState>(() => readQuota());
  const blobRef = useRef<Blob | null>(null);

  const remaining = Math.max(0, MONTHLY_LIMIT - quota.count);

  const compress = useCallback(async (file: File | Blob) => {
    setIsCompressing(true);
    try {
      const out = await compressReceiptImage(file);
      blobRef.current = out.blob;
      return out;
    } finally {
      setIsCompressing(false);
    }
  }, []);

  const scan = useCallback(async (override?: Blob): Promise<ReceiptScanResult> => {
    const current = readQuota();
    if (current.count >= MONTHLY_LIMIT) {
      throw new Error(`Monthly scan limit reached (${MONTHLY_LIMIT}/month). Resets next month.`);
    }
    const blob = override || blobRef.current;
    if (!blob) throw new Error('No image ready');

    setIsScanning(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      const form = new FormData();
      form.append('image', blob, 'receipt.webp');
      form.append('model', 'google/gemini-2.5-flash-lite');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-receipt`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
          body: form,
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timeout));

      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);

      const next: QuotaState = { month: currentMonthKey(), count: current.count + 1 };
      writeQuota(next);
      setQuota(next);

      return data as ReceiptScanResult;
    } finally {
      setIsScanning(false);
    }
  }, []);

  return {
    compress,
    scan,
    isCompressing,
    isScanning,
    remaining,
    monthlyLimit: MONTHLY_LIMIT,
    setBlob: (b: Blob | null) => { blobRef.current = b; },
  };
};