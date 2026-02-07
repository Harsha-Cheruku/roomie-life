import { useState, useEffect } from 'react';
import { ArrowLeft, Bell, BellOff, MessageSquare, Receipt, CheckSquare, Clock, Gamepad2, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/layout/BottomNav';
import { useNavigation } from '@/hooks/useNavigation';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';

interface NotificationPreferences {
  tasks: boolean;
  expenses: boolean;
  reminders: boolean;
  chat: boolean;
  alarms: boolean;
  games: boolean;
  system: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  tasks: true,
  expenses: true,
  reminders: true,
  chat: true,
  alarms: true,
  games: true,
  system: true,
};

const STORAGE_KEY = 'notification-preferences';

export const getNotificationPreferences = (): NotificationPreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Error reading notification preferences:', e);
  }
  return DEFAULT_PREFERENCES;
};

export const isNotificationTypeEnabled = (type: string): boolean => {
  const prefs = getNotificationPreferences();
  return prefs[type as keyof NotificationPreferences] ?? true;
};

const NotificationSettings = () => {
  const navigate = useNavigate();
  const { activeTab, navigateToTab } = useNavigation();
  const { toast } = useToast();
  const { isSupported, isEnabled, permission, requestPermission, isLoading } = usePushNotifications();
  
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPreferences(getNotificationPreferences());
  }, []);

  const savePreferences = (newPrefs: NotificationPreferences) => {
    setPreferences(newPrefs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
    toast({
      title: 'Settings saved',
      description: 'Your notification preferences have been updated.',
    });
  };

  const togglePreference = (key: keyof NotificationPreferences) => {
    const newPrefs = { ...preferences, [key]: !preferences[key] };
    savePreferences(newPrefs);
  };

  const enableAll = () => {
    const allEnabled = Object.keys(DEFAULT_PREFERENCES).reduce((acc, key) => {
      acc[key as keyof NotificationPreferences] = true;
      return acc;
    }, {} as NotificationPreferences);
    savePreferences(allEnabled);
  };

  const disableAll = () => {
    const allDisabled = Object.keys(DEFAULT_PREFERENCES).reduce((acc, key) => {
      acc[key as keyof NotificationPreferences] = false;
      return acc;
    }, {} as NotificationPreferences);
    savePreferences(allDisabled);
  };

  const notificationTypes = [
    {
      key: 'tasks' as const,
      label: 'Tasks',
      description: 'Task assignments, completions, and updates',
      icon: CheckSquare,
      color: 'text-primary',
    },
    {
      key: 'expenses' as const,
      label: 'Expenses',
      description: 'Expense splits, payments, and approvals',
      icon: Receipt,
      color: 'text-mint',
    },
    {
      key: 'reminders' as const,
      label: 'Reminders',
      description: 'Scheduled reminders and alerts',
      icon: Clock,
      color: 'text-accent',
    },
    {
      key: 'chat' as const,
      label: 'Chat Messages',
      description: 'New messages from roommates',
      icon: MessageSquare,
      color: 'text-lavender',
    },
    {
      key: 'alarms' as const,
      label: 'Alarms',
      description: 'Shared alarm notifications',
      icon: Bell,
      color: 'text-coral',
    },
    {
      key: 'games' as const,
      label: 'Games',
      description: 'Game invites and updates',
      icon: Gamepad2,
      color: 'text-accent',
    },
    {
      key: 'system' as const,
      label: 'System',
      description: 'App updates and announcements',
      icon: Bell,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate('/notifications')}
            className="w-10 h-10 rounded-xl bg-card flex items-center justify-center press-effect"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-display font-bold">Notification Settings</h1>
            <p className="text-sm text-muted-foreground">Customize your alerts</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-6">
        {/* Push Notifications Status */}
        <section className="bg-card rounded-2xl p-4 shadow-card">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isEnabled ? 'bg-mint/20' : 'bg-muted'}`}>
              {isEnabled ? (
                <Bell className="w-6 h-6 text-mint" />
              ) : (
                <BellOff className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Push Notifications</h3>
              <p className="text-sm text-muted-foreground">
                {!isSupported 
                  ? 'Not supported on this browser'
                  : isEnabled 
                    ? 'Enabled - You\'ll receive alerts even when the app is closed'
                    : permission === 'denied'
                      ? 'Blocked - Enable in browser settings'
                      : 'Disabled - Enable to receive background alerts'
                }
              </p>
            </div>
          </div>
          {isSupported && !isEnabled && permission !== 'denied' && (
            <Button
              onClick={requestPermission}
              disabled={isLoading}
              className="w-full gap-2"
            >
              <Bell className="w-4 h-4" />
              {isLoading ? 'Enabling...' : 'Enable Push Notifications'}
            </Button>
          )}
        </section>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={enableAll}
            className="flex-1"
          >
            Enable All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={disableAll}
            className="flex-1"
          >
            Disable All
          </Button>
        </div>

        {/* Notification Types */}
        <section className="space-y-3">
          <h2 className="font-display font-semibold text-lg px-1">Notification Types</h2>
          
          <div className="bg-card rounded-2xl divide-y divide-border shadow-card overflow-hidden">
            {notificationTypes.map((type) => {
              const Icon = type.icon;
              return (
                <div
                  key={type.key}
                  className="flex items-center gap-3 p-4"
                >
                  <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${type.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{type.label}</p>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                  <Switch
                    checked={preferences[type.key]}
                    onCheckedChange={() => togglePreference(type.key)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Info */}
        <p className="text-sm text-muted-foreground text-center px-4">
          These settings control in-app and push notifications. 
          You'll still see notifications in the app even if push is disabled.
        </p>
      </div>

      <BottomNav activeTab={activeTab} onTabChange={navigateToTab} />
    </div>
  );
};

export default NotificationSettings;
