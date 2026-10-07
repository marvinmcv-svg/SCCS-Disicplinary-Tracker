// EN/ES segmented toggle, styled as an Apple segmented control. Works on the
// light sidebar, the glass top bar and the login page alike.
import { useI18n } from '../i18n';

export default function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const segment =
    'px-2.5 py-1 text-xs font-semibold rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50';
  return (
    <div
      className={`inline-flex items-center bg-[var(--fill)] rounded-full p-0.5 shrink-0 ${className}`}
      role="group"
      aria-label={t('Language / Idioma')}
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        title="English"
        className={`${segment} ${
          lang === 'en' ? 'bg-white dark:bg-[#636366] text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('es')}
        aria-pressed={lang === 'es'}
        title="Español"
        className={`${segment} ${
          lang === 'es' ? 'bg-white dark:bg-[#636366] text-gray-900 shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-gray-500 hover:text-gray-900'
        }`}
      >
        ES
      </button>
    </div>
  );
}
