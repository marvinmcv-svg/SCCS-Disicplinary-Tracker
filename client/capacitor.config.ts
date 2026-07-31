import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sccs.discipline',
  appName: 'SCCS Discipline',
  webDir: 'dist',
  server: {
    // Must match the service's actual Railway domain. This previously pointed at
    // 'discipline-tracker-production-ba1c.up.railway.app', which belongs to no
    // running service — a leftover from an earlier deployment.
    hostname: 'sccs-disicplinary-tracker-production.up.railway.app',
    androidScheme: 'https',
  },
};

export default config;