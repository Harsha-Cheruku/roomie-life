import { cn } from "@/lib/utils";
import { useState } from "react";

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

export const ProfileAvatar = ({ avatar, size = "md", className }: ProfileAvatarProps) => {
  const [imgError, setImgError] = useState(false);
  const isUrl = avatar && (avatar.startsWith("http") || avatar.startsWith("blob:") || avatar.startsWith("data:"));

  return (
    <div
      className={cn(
        "rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0",
        sizeMap[size],
        className
      )}
    >
      {isUrl && !imgError ? (
        <img
          src={avatar}
          alt="avatar"
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <span>{avatar && !isUrl ? avatar : "😎"}</span>
      )}
    </div>
  );
};
