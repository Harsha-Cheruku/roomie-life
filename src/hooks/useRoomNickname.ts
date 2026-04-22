import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const KEY_PREFIX = "roommate_room_nickname";

const buildKey = (userId: string, roomId: string) =>
  `${KEY_PREFIX}:${userId}:${roomId}`;

export const getRoomNickname = (userId: string | undefined, roomId: string | undefined) => {
  if (!userId || !roomId) return "";
  try {
    return localStorage.getItem(buildKey(userId, roomId)) || "";
  } catch {
    return "";
  }
};

/**
 * Per-user, per-room nickname stored locally. Does NOT change the
 * actual room name for other members — purely a personal label.
 */
export const useRoomNickname = (roomId: string | undefined, fallback: string) => {
  const { user } = useAuth();
  const [nickname, setNicknameState] = useState<string>(() =>
    getRoomNickname(user?.id, roomId)
  );

  useEffect(() => {
    setNicknameState(getRoomNickname(user?.id, roomId));
  }, [user?.id, roomId]);

  // Sync across tabs / other components
  useEffect(() => {
    if (!user?.id || !roomId) return;
    const key = buildKey(user.id, roomId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setNicknameState(e.newValue || "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user?.id, roomId]);

  const setNickname = useCallback(
    (value: string) => {
      if (!user?.id || !roomId) return;
      const key = buildKey(user.id, roomId);
      const trimmed = value.trim();
      try {
        if (trimmed) localStorage.setItem(key, trimmed);
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      setNicknameState(trimmed);
    },
    [user?.id, roomId]
  );

  return {
    nickname,
    displayName: nickname || fallback,
    setNickname,
  };
};