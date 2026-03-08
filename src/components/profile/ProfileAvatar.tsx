import { cn } from "@/lib/utils";

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
  const isUrl = avatar?.startsWith("http");

  return (
    <div
      className={cn(
        "rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0",
        sizeMap[size],
        className
      )}
    >
      {isUrl ? (
        <img src={avatar!} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <span>{avatar || "😎"}</span>
      )}
    </div>
  );
};
