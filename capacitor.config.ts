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
  }
}

export default config
