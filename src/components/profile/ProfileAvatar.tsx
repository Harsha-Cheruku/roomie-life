import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface ProfileAvatarProps {
  avatar: string | null | undefined;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  xs: "w-5 h-5 text-[10px]",
  sm: "w-8 h-8 text-lg",
  md: "w-10 h-10 text-xl",
  lg: "w-12 h-12 text-2xl",
  xl: "w-16 h-16 text-3xl",
};

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i;

const resolveAvatarImageSrc = (avatar: string | null | undefined): string | null => {
  if (!avatar) return null;
  const value = avatar.trim();
  if (!value) return null;

  // Full URLs (http, blob, data)
  if (value.startsWith("http") || value.startsWith("blob:") || value.startsWith("data:")) return value;
  if (value.startsWith("//")) return `https:${value}`;

  const looksLikeImagePath = IMAGE_EXT_RE.test(value);
  if (!looksLikeImagePath) return null;

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Supabase storage paths
  if (value.startsWith("avatars/")) {
    return `${baseUrl}/storage/v1/object/public/${value}`;
  }

  // Pattern: userId/filename.ext
  if (/^[^/]+\/[^/]+\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(value)) {
    return `${baseUrl}/storage/v1/object/public/avatars/${value}`;
  }

  if (value.startsWith("/")) return value;
  return null;
};

// Simple check: emoji or very short string that doesn't look like a path
const isEmoji = (val: string): boolean => {
  // If it resolves to an image URL, it's not an emoji
  if (resolveAvatarImageSrc(val)) return false;
  // Short strings (1-4 chars) are likely emojis
  if (val.length <= 4) return true;
  // Longer strings that don't look like paths are probably emoji combos
  return !/[./:]/.test(val);
};

export const ProfileAvatar = ({ avatar, size = "md", className }: ProfileAvatarProps) => {
  const [imgError, setImgError] = useState(false);
  const imageSrc = useMemo(() => resolveAvatarImageSrc(avatar), [avatar]);

  useEffect(() => {
    setImgError(false);
  }, [imageSrc]);

  return (
    <div
      className={cn(
        "rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0",
        sizeMap[size],
        className
      )}
    >
      {imageSrc && !imgError ? (
        <img
          src={imageSrc}
          alt="Profile photo"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span>{avatar && isEmoji(avatar) ? avatar : "😎"}</span>
      )}
    </div>
  );
};
