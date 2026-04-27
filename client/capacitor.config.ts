import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sccs.discipline',
  appName: 'SCCS Discipline',
  webDir: 'dist',
  server: {
    hostname: 'discipline-tracker-production-ba1c.up.railway.app',
    androidScheme: 'https',
  },
};

export default config;