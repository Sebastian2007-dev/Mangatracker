import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mangaTracker.app',
  appName: 'Manga Tracker',
  webDir: 'dist-mobile',
  android: {
    backgroundColor: '#000000'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF'
    },
    CapacitorHttp: {
      enabled: false
    },
    BackgroundRunner: {
      label: 'com.mangaTracker.app.background',
      src: 'background.runner.js',
      event: 'checkChapters',
      repeat: true,
      interval: 15,
      autoStart: true
    }
  }
}

export default config
