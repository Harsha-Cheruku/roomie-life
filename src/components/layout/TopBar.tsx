import { ArrowLeft, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightContent?: React.ReactNode;
  className?: string;
  hint?: string;
}

export const TopBar = ({ 
  title, 
  showBack = true, 
  onBack, 
  rightContent,
  className,
  hint
}: TopBarProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className={cn("px-4 pt-6 pb-4", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={handleBack}
              className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-all active:scale-95"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
          </div>
        </div>
        {rightContent && (
          <div className="flex items-center gap-2">
            {rightContent}
          </div>
        )}
      </div>
      {hint && (
        <p className="text-xs text-muted-foreground ml-13 pl-0.5 animate-fade-in">
          {hint}
        </p>
      )}
    </header>
  );
};
