// Appearance (Automatic / Light / Dark) and "Install app" controls, shared by
// the sidebar, the phone drawer, Settings and the sign-in screen.
import { useState, useSyncExternalStore } from 'react';
import { Download, Moon, Sun, Share, SquarePlus, MonitorDown, Check } from 'lucide-react';
import { getInstallState, getServerInstallState, promptInstall, subscribeInstall } from '@/lib/pwa';
import { getServerThemePref, getThemePref, isDarkNow, setThemePref, subscribeTheme, type ThemePref } from '@/lib/theme';
import { useI18n } from '../i18n';
import { Segmented, Sheet } from './kit';

export function useThemePref() {
  return useSyncExternalStore(subscribeTheme, getThemePref, getServerThemePref);
}

export function useIsDark() {
  return useSyncExternalStore(subscribeTheme, isDarkNow, () => false);
}

export function useInstallState() {
  return useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
}

export function AppearanceControl() {
  const { t } = useI18n();
  const pref = useThemePref();
  return (
    <Segmented<ThemePref>
      label={t('Appearance')}
      value={pref}
      onChange={setThemePref}
      options={[
        { value: 'system', label: t('Automatic') },
        { value: 'light', label: t('Light') },
        { value: 'dark', label: t('Dark') },
      ]}
    />
  );
}

/** One-tap light/dark switch for the app chrome. */
export function ThemeToggleButton() {
  const { t } = useI18n();
  const dark = useIsDark();
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setThemePref(dark ? 'light' : 'dark')}
      aria-label={dark ? t('Switch to light mode') : t('Switch to dark mode')}
      title={dark ? t('Switch to light mode') : t('Switch to dark mode')}
    >
      {dark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}

/**
 * "Install app": uses the browser's install prompt where there is one
 * (Chrome, Edge, Android) and otherwise explains the manual steps (Safari on
 * iPhone and iPad, Safari on Mac, Firefox). Hidden inside the installed app.
 */
export function InstallAppButton({ variant = 'row' }: { variant?: 'row' | 'button' | 'link' }) {
  const { t } = useI18n();
  const install = useInstallState();
  const [help, setHelp] = useState(false);

  if (install.installed) {
    return variant === 'button' ? (
      <p className="inline-flex items-center gap-2 text-sm text-green-700">
        <Check className="w-4 h-4" /> {t('Installed on this device')}
      </p>
    ) : null;
  }

  const onClick = async () => {
    if (install.canPrompt) {
      const outcome = await promptInstall();
      if (outcome !== 'unavailable') return;
    }
    setHelp(true);
  };

  const label = t('Install app');
  const trigger =
    variant === 'button' ? (
      <button type="button" className="btn btn-primary" onClick={onClick}>
        <Download className="w-4 h-4" /> {label}
      </button>
    ) : variant === 'link' ? (
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
        <Download className="w-4 h-4" /> {label}
      </button>
    ) : (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 w-full px-3 py-2 text-blue-600 hover:bg-[var(--fill-hover)] rounded-[9px] transition-colors text-sm font-medium"
      >
        <Download className="w-[18px] h-[18px]" />
        <span>{label}</span>
      </button>
    );

  return (
    <>
      {trigger}
      <Sheet open={help} onClose={() => setHelp(false)} title={t('Install SCCS on this device')} testId="install-help">
        <InstallSteps ios={install.ios} />
        <button type="button" className="btn btn-primary w-full mt-6" onClick={() => setHelp(false)}>
          {t('Done')}
        </button>
      </Sheet>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold flex items-center justify-center shrink-0">{n}</span>
      <span className="pt-0.5 text-[15px] text-gray-900 leading-relaxed">{children}</span>
    </li>
  );
}

function InstallSteps({ ios }: { ios: boolean }) {
  const { t } = useI18n();
  const icon = 'inline w-[18px] h-[18px] -mt-0.5 text-blue-600';
  if (ios) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">{t('On iPhone and iPad, apps are installed from Safari.')}</p>
        <ol className="space-y-3">
          <Step n={1}>{t('Open this page in Safari.')}</Step>
          <Step n={2}>
            {t('Tap the Share button')} <Share className={icon} aria-hidden="true" />
          </Step>
          <Step n={3}>
            {t('Choose Add to Home Screen')} <SquarePlus className={icon} aria-hidden="true" />
          </Step>
          <Step n={4}>{t('Tap Add. SCCS opens full screen from your Home Screen.')}</Step>
        </ol>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        <Step n={1}>
          {t('Chrome or Edge: click the install icon at the right of the address bar')} <MonitorDown className={icon} aria-hidden="true" />
          {t(', or open the browser menu and choose Install SCCS.')}
        </Step>
        <Step n={2}>{t('Android: open the Chrome menu (three dots) and tap Install app or Add to Home screen.')}</Step>
        <Step n={3}>{t('Safari on Mac: choose File, then Add to Dock.')}</Step>
      </ol>
      <p className="text-sm text-gray-500">{t('If you do not see the option, reload the page once and try again.')}</p>
    </div>
  );
}
