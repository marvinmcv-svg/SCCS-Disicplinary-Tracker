'use client';

import { useEffect } from 'react';
import { startPwa } from '@/lib/pwa';
import { startTheme } from '@/lib/theme';

// Mounted once in the root layout: keeps the appearance in sync with the
// device and registers the service worker so the app can be installed.
export default function PwaSetup() {
  useEffect(() => {
    startTheme();
    startPwa();
  }, []);
  return null;
}
