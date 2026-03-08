import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.33f96bab05a84df9939e66df730e6530',
  appName: 'RoomMate',
  webDir: 'dist',
  // For development, uncomment the server block below:
  // server: {
  //   url: 'https://33f96bab-05a8-4df9-939e-66df730e6530.lovableproject.com?forceHideBadge=true',
  //   cleartext: true,
  // },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_alarm',
      iconColor: '#EF4444',
      sound: 'alarm_sound.wav',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#FDFAF6',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
