import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cn.firstexportorder.game',
  appName: '出海第一单',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: { SystemBars: { style: 'DARK', insetsHandling: 'native' } },
};
export default config;
