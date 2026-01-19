import { useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';

interface PushNotificationPromptProps {
  onDismiss?: () => void;
  variant?: 'banner' | 'card';
}

export const PushNotificationPrompt = ({ onDismiss, variant = 'banner' }: PushNotificationPromptProps) => {
  const { isSupported, isEnabled, permission, isLoading, requestPermission } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  if (!isSupported || isEnabled || permission === 'denied' || dismissed) {
    return null;
  }

  const handleEnable = async () => {
    const success = await requestPermission();
    if (success) {
      setDismissed(true);
      onDismiss?.();
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (variant === 'card') {
    return (
      <div className="bg-card border border-border rounded-2xl p-4 shadow-card">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-1">Enable Notifications</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Get instant alerts for tasks, expenses, and reminders even when the app is in the background.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={isLoading}
                className="gap-2"
              >
                <Bell className="w-4 h-4" />
                {isLoading ? 'Enabling...' : 'Enable'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
              >
                Not now
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed top-16 left-0 right-0 z-40 mx-4 animate-slide-down",
      "bg-gradient-to-r from-primary/90 to-accent/90 backdrop-blur-lg",
      "rounded-2xl shadow-lg p-4"
    )}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white text-sm">Enable push notifications</p>
          <p className="text-xs text-white/80">Get alerts even when app is closed</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleEnable}
          disabled={isLoading}
          className="bg-white text-primary hover:bg-white/90"
        >
          {isLoading ? 'Enabling...' : 'Enable'}
        </Button>
        <button
          onClick={handleDismiss}
          className="text-white/80 hover:text-white ml-1"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
