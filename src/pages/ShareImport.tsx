import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, MessageSquare, Receipt, FolderOpen, Loader2, Check, AlertCircle, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface SharedFileMeta {
  name: string;
  type: string;
  size: number;
  url: string;
}

interface SharedPayload {
  files: SharedFileMeta[];
  title?: string;
  text?: string;
  ts: number;
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

const base64ToBlob = (b64: string, type: string): Blob => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
};

export default function ShareImport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, currentRoom } = useAuth();
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [previews, setPreviews] = useState<{ url: string; name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [autoHandled, setAutoHandled] = useState(false);
  // Hold blobs in memory so we don't re-fetch from cache for upload — much faster on mobile.
  const blobsRef = useRef<File[]>([]);
  const [pendingPayment, setPendingPayment] = useState<{
    splitId: string; expenseId: string; expenseTitle: string; amount: number; expensePaidBy: string; ts: number;
  } | null>(null);
  const [showSplitPicker, setShowSplitPicker] = useState(false);
  const [unpaidSplits, setUnpaidSplits] = useState<{
    id: string; amount: number; expense_id: string; title: string; paid_by: string;
  }[]>([]);
  const [loadingSplits, setLoadingSplits] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Detect a pending "Mark as Paid" handoff so we can offer "Use as payment proof"
        try {
          const raw = sessionStorage.getItem('roommate_pending_payment_split');
          if (raw) {
            const parsed = JSON.parse(raw);
            // Drop after 30 minutes to avoid stale handoffs
            if (parsed?.ts && Date.now() - parsed.ts < 30 * 60 * 1000) {
              setPendingPayment(parsed);
            } else {
              sessionStorage.removeItem('roommate_pending_payment_split');
            }
          }
        } catch {/* ignore */}

        // 1) Native Android share-intent payload injected by MainActivity
        const nativePayload = (window as unknown as {
          __roommateSharedIntent?: {
            files: { name: string; type: string; dataBase64: string }[];
            title?: string;
            text?: string;
            ts: number;
          };
        }).__roommateSharedIntent;

        if (nativePayload && nativePayload.files?.length) {
          const meta: SharedFileMeta[] = [];
          const out: { url: string; name: string; type: string }[] = [];
          for (let i = 0; i < nativePayload.files.length; i++) {
            const f = nativePayload.files[i];
            const blob = base64ToBlob(f.dataBase64, f.type);
            const url = URL.createObjectURL(blob);
            // Skip the cache round-trip — we keep blobs in memory for upload (faster).
            meta.push({ name: f.name, type: f.type, size: blob.size, url });
            blobsRef.current.push(new File([blob], f.name, { type: f.type || blob.type }));
            out.push({ url, name: f.name, type: f.type });
          }
          delete (window as unknown as { __roommateSharedIntent?: unknown }).__roommateSharedIntent;
          setPayload({ files: meta, title: nativePayload.title, text: nativePayload.text, ts: nativePayload.ts });
          setPreviews(out);
          setLoading(false);
          return;
        }

        // 2) PWA Web Share Target — files cached by service worker
        const metaRes = await fetch("/__shared/meta", { cache: "no-store" });
        if (!metaRes.ok) {
          setLoading(false);
          return;
        }
        const meta = (await metaRes.json()) as SharedPayload;
        setPayload(meta);
        const out: { url: string; name: string; type: string }[] = [];
        for (const f of meta.files) {
          try {
            const r = await fetch(f.url, { cache: "no-store" });
            const b = await r.blob();
            blobsRef.current.push(new File([b], f.name, { type: f.type || b.type }));
            out.push({ url: URL.createObjectURL(b), name: f.name, type: f.type });
          } catch {/* skip */}
        }
        setPreviews(out);
      } catch {
        // nothing shared
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      blobsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSharedBlobs = async (): Promise<File[]> => {
    // Prefer in-memory blobs (no re-decode, no cache fetch)
    if (blobsRef.current.length) return blobsRef.current;
    if (!payload) return [];
    const out: File[] = [];
    for (const f of payload.files) {
      const r = await fetch(f.url, { cache: "no-store" });
      const b = await r.blob();
      out.push(new File([b], f.name, { type: f.type || b.type }));
    }
    return out;
  };

  const clearShared = async () => {
    try {
      const cache = await caches.open("shared-files");
      const keys = await cache.keys();
      await Promise.all(keys.map((k) => cache.delete(k)));
    } catch {/* ignore */}
  };

  const uploadAll = async (folder: "personal" | "shared") => {
    if (!user) {
      toast.error("Sign in first");
      navigate("/auth");
      return [];
    }
    const files = await fetchSharedBlobs();
    const paths: { path: string; type: string; name: string }[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      paths.push({ path, type: file.type.startsWith("image/") ? "image" : "file", name: file.name });
    }
    return paths;
  };

  const handleSendToRoom = async () => {
    if (!currentRoom) {
      toast.error("Join a room first");
      navigate("/setup");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadAll("shared");
      for (const u of uploaded) {
        await supabase.from("messages").insert({
          room_id: currentRoom.id,
          sender_id: user!.id,
          content: JSON.stringify({ filePath: u.path, fileName: u.name }),
          message_type: u.type,
        });
      }
      if (payload?.text || payload?.title) {
        await supabase.from("messages").insert({
          room_id: currentRoom.id,
          sender_id: user!.id,
          content: [payload.title, payload.text].filter(Boolean).join(" — "),
          message_type: "text",
        });
      }
      await clearShared();
      toast.success(`Sent ${uploaded.length} item(s) to room chat`);
      navigate("/chat");
    } catch (e) {
      console.error(e);
      toast.error("Failed to send to room");
    } finally {
      setBusy(false);
    }
  };

  const handleSavePersonal = async () => {
    setBusy(true);
    try {
      const uploaded = await uploadAll("personal");
      await clearShared();
      toast.success(`Saved ${uploaded.length} item(s) to your personal storage`);
      navigate("/storage");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBill = async () => {
    const imageFile = previews.find((p) => p.type.startsWith("image/"));
    if (!imageFile) {
      toast.error("Bill scanner needs an image");
      return;
    }
    setBusy(true);
    try {
      const blobRes = await fetch(imageFile.url);
      const blob = await blobRes.blob();
      const dataUrl = await blobToDataUrl(blob);
      sessionStorage.setItem("roommate_pending_bill_image", dataUrl);
      await clearShared();
      navigate("/expenses?shareBill=1");
    } catch (e) {
      console.error(e);
      toast.error("Failed to prepare bill");
    } finally {
      setBusy(false);
    }
  };

  const handleAttachToPayment = async () => {
    if (!pendingPayment) return;
    const imageFile = previews.find((p) => p.type.startsWith("image/"));
    if (!imageFile) {
      toast.error("Pick an image to attach as payment proof");
      return;
    }
    setBusy(true);
    try {
      const blobRes = await fetch(imageFile.url);
      const blob = await blobRes.blob();
      const dataUrl = await blobToDataUrl(blob);
      sessionStorage.setItem("roommate_pending_payment_image", dataUrl);
      // Tell Expenses to re-open the Mark-as-Paid dialog for this split
      sessionStorage.setItem(
        "roommate_resume_mark_paid",
        JSON.stringify(pendingPayment),
      );
      sessionStorage.removeItem("roommate_pending_payment_split");
      await clearShared();
      navigate(`/expenses?resumePayment=${pendingPayment.splitId}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to prepare proof");
    } finally {
      setBusy(false);
    }
  };

  const openSplitPicker = async () => {
    if (!user) {
      toast.error("Sign in first");
      navigate("/auth");
      return;
    }
    if (!currentRoom) {
      toast.error("Join a room first");
      return;
    }
    setLoadingSplits(true);
    setShowSplitPicker(true);
    try {
      const { data, error } = await supabase
        .from("expense_splits")
        .select("id, amount, expense_id, expenses!inner(id, title, paid_by, room_id, status)")
        .eq("user_id", user.id)
        .eq("is_paid", false)
        .neq("status", "rejected")
        .eq("expenses.room_id", currentRoom.id)
        .neq("expenses.status", "settled")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = (data || [])
        .filter((r: { expenses: { paid_by: string } }) => r.expenses?.paid_by !== user.id)
        .map((r: { id: string; amount: number; expense_id: string; expenses: { title: string; paid_by: string } }) => ({
          id: r.id,
          amount: Number(r.amount),
          expense_id: r.expense_id,
          title: r.expenses.title,
          paid_by: r.expenses.paid_by,
        }));
      setUnpaidSplits(rows);
    } catch (e) {
      console.error(e);
      toast.error("Could not load your bills");
    } finally {
      setLoadingSplits(false);
    }
  };

  const pickSplitForProof = async (s: { id: string; amount: number; expense_id: string; title: string; paid_by: string }) => {
    const imageFile = previews.find((p) => p.type.startsWith("image/"));
    if (!imageFile) {
      toast.error("Pick an image to attach as payment proof");
      return;
    }
    setBusy(true);
    try {
      const blobRes = await fetch(imageFile.url);
      const blob = await blobRes.blob();
      const dataUrl = await blobToDataUrl(blob);
      sessionStorage.setItem("roommate_pending_payment_image", dataUrl);
      sessionStorage.setItem(
        "roommate_resume_mark_paid",
        JSON.stringify({
          splitId: s.id,
          expenseId: s.expense_id,
          expenseTitle: s.title,
          amount: s.amount,
          expensePaidBy: s.paid_by,
          ts: Date.now(),
        }),
      );
      sessionStorage.removeItem("roommate_pending_payment_split");
      await clearShared();
      setShowSplitPicker(false);
      navigate(`/expenses?resumePayment=${s.id}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to prepare proof");
    } finally {
      setBusy(false);
    }
  };

  // Auto-route when launched from a dedicated share-target alias (Android).
  useEffect(() => {
    if (loading || autoHandled || busy || previews.length === 0) return;
    const as = searchParams.get("as");
    // If a Mark-as-Paid is waiting, jump straight back into it.
    if (pendingPayment && previews.some((p) => p.type.startsWith("image/"))) {
      setAutoHandled(true);
      handleAttachToPayment();
      return;
    }
    if (as === "bill" && previews.some((p) => p.type.startsWith("image/"))) {
      setAutoHandled(true);
      handleCreateBill();
    } else if (as === "chat" && currentRoom) {
      setAutoHandled(true);
      handleSendToRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, previews, searchParams, currentRoom, pendingPayment]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!payload || previews.length === 0) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-xl font-bold">Nothing shared</h1>
        </div>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              No shared files were received. Open the share menu in another app
              (gallery, screenshots, files) and pick <strong>RoomMate</strong>.
            </p>
            <Button onClick={() => navigate("/")}>Go home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="px-4 pt-6 pb-4 border-b border-border flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold">Share into RoomMate</h1>
          <p className="text-xs text-muted-foreground">
            {previews.length} item{previews.length !== 1 ? "s" : ""} ready
          </p>
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {previews.map((p, i) => (
            <div key={i} className="aspect-square rounded-xl overflow-hidden bg-muted relative">
              {p.type.startsWith("image/") ? (
                <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-2 text-center break-all">
                  {p.name}
                </div>
              )}
            </div>
          ))}
        </div>

        {(payload.title || payload.text) && (
          <Card>
            <CardContent className="p-3 text-sm text-muted-foreground">
              {payload.title && <p className="font-medium text-foreground">{payload.title}</p>}
              {payload.text && <p className="mt-1">{payload.text}</p>}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Where should this go?</p>

          {pendingPayment && (
            <Button
              onClick={handleAttachToPayment}
              disabled={busy || !previews.some((p) => p.type.startsWith("image/"))}
              className="w-full justify-start gap-3 h-14"
            >
              <Wallet className="w-5 h-5" />
              <div className="text-left">
                <p className="font-medium">Use as payment proof</p>
                <p className="text-xs opacity-90">
                  Attach to "{pendingPayment.expenseTitle}" (₹{pendingPayment.amount.toFixed(0)})
                </p>
              </div>
            </Button>
          )}

          {!pendingPayment && (
            <Button
              onClick={openSplitPicker}
              disabled={busy || !previews.some((p) => p.type.startsWith("image/"))}
              className="w-full justify-start gap-3 h-14"
            >
              <Wallet className="w-5 h-5" />
              <div className="text-left">
                <p className="font-medium">Send to Mark as Paid</p>
                <p className="text-xs opacity-90">Pick a bill to settle with this screenshot</p>
              </div>
            </Button>
          )}

          <Button
            onClick={handleSendToRoom}
            disabled={busy || !currentRoom}
            className="w-full justify-start gap-3 h-14"
            variant="outline"
          >
            <MessageSquare className="w-5 h-5 text-primary" />
            <div className="text-left">
              <p className="font-medium">Send to Room Chat</p>
              <p className="text-xs text-muted-foreground">
                {currentRoom ? `Posts to ${currentRoom.name}` : "Join a room first"}
              </p>
            </div>
          </Button>

          <Button
            onClick={handleCreateBill}
            disabled={busy || !previews.some((p) => p.type.startsWith("image/"))}
            className="w-full justify-start gap-3 h-14"
            variant="outline"
          >
            <Receipt className="w-5 h-5 text-primary" />
            <div className="text-left">
              <p className="font-medium">Use as Bill / Receipt</p>
              <p className="text-xs text-muted-foreground">Opens the bill scanner with this image</p>
            </div>
          </Button>

          <Button
            onClick={handleSavePersonal}
            disabled={busy}
            className="w-full justify-start gap-3 h-14"
            variant="outline"
          >
            <FolderOpen className="w-5 h-5 text-primary" />
            <div className="text-left">
              <p className="font-medium">Save to Personal Storage</p>
              <p className="text-xs text-muted-foreground">Private to you, accessible later</p>
            </div>
          </Button>
        </div>

        {busy && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Working…
          </div>
        )}
      </div>

      <Dialog open={showSplitPicker} onOpenChange={setShowSplitPicker}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Settle which bill?</DialogTitle>
            <DialogDescription>
              Pick a bill you owe. We'll attach this screenshot as proof and mark it paid.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2 py-1">
            {loadingSplits ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : unpaidSplits.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No unpaid bills found.
              </p>
            ) : (
              unpaidSplits.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickSplitForProof(s)}
                  disabled={busy}
                  className="w-full text-left p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground">Tap to mark as paid</p>
                  </div>
                  <span className="font-semibold text-primary whitespace-nowrap">
                    ₹{s.amount.toFixed(0)}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}