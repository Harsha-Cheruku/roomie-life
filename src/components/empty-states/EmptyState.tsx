import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  emoji?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState = ({
  icon: Icon,
  emoji,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center animate-scale-in", className)}>
      {emoji ? (
        <div className="text-6xl mb-4 animate-float">{emoji}</div>
      ) : Icon ? (
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-4">
          <Icon className="w-10 h-10 text-muted-foreground" />
        </div>
      ) : null}
      
      <h3 className="font-display text-xl font-semibold text-foreground mb-2">
        {title}
      </h3>
      
      <p className="text-muted-foreground max-w-xs mb-6">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button 
          variant="gradient" 
          onClick={onAction}
          className="animate-slide-up"
          style={{ animationDelay: '100ms' }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
