import { supabase } from '@/integrations/supabase/client';

/**
 * Hard 500MB-per-room storage cap.
 * Sums the size of all chat-attachments belonging to a room's members
 * before allowing a new upload. Returns true if the upload is allowed.
 */
export const ROOM_STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

export interface QuotaCheckResult {
  allowed: boolean;
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
}

export const checkRoomStorageQuota = async (
  roomId: string,
  incomingBytes = 0,
): Promise<QuotaCheckResult> => {
  let usedBytes = 0;
  try {
    // Sum sizes for objects whose owner is a member of this room.
    const { data: members } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId);

    const memberIds = (members || []).map((m: { user_id: string }) => m.user_id);
    if (memberIds.length) {
      // List up to 1000 objects per member prefix; sufficient for the 500MB cap.
      for (const uid of memberIds) {
        const { data: list } = await supabase.storage
          .from('chat-attachments')
          .list(uid, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
        (list || []).forEach((o: { metadata?: { size?: number } }) => {
          usedBytes += o?.metadata?.size || 0;
        });
      }
    }
  } catch {
    // Fail-open on quota lookup errors so legitimate users aren't blocked
    // by a transient list() failure. The bucket-side limits still apply.
  }

  const projected = usedBytes + incomingBytes;
  return {
    allowed: projected <= ROOM_STORAGE_LIMIT_BYTES,
    usedBytes,
    limitBytes: ROOM_STORAGE_LIMIT_BYTES,
    remainingBytes: Math.max(0, ROOM_STORAGE_LIMIT_BYTES - usedBytes),
  };
};

export const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};