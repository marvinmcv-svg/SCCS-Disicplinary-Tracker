// EN/ES segmented toggle. Compact pill that works on the blue gradient
// sidebar/header, the white top bar and the login page alike.
import { useI18n } from '../i18n';

export default function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const segment =
    'px-2.5 py-1 text-xs font-semibold rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
  return (
    <div
      className={`inline-flex items-center bg-black/15 rounded-full p-0.5 ${className}`}
      role="group"
      aria-label={t('Language / Idioma')}
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        title="English"
        className={`${segment} ${
          lang === 'en' ? 'bg-white text-blue-800 shadow-sm' : 'text-white/75 hover:text-white'
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
          lang === 'es' ? 'bg-white text-blue-800 shadow-sm' : 'text-white/75 hover:text-white'
        }`}
      >
        ES
      </button>
    </div>
  );
}
