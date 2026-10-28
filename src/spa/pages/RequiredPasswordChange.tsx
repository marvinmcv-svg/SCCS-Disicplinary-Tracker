// Shown instead of the app while the account is on a temporary or publicly
// known password (seeded defaults, admin resets). The API answers nothing else
// until the password is changed.
import { KeyRound } from 'lucide-react';
import { useAuth } from '../App';
import ChangePasswordForm from '../components/ChangePasswordForm';
import LanguageToggle from '../components/LanguageToggle';
import { useI18n } from '../i18n';

export default function RequiredPasswordChange() {
  const { user, login, logout } = useAuth();
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-10">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-[420px] p-6 md:p-9 bg-white rounded-[28px] border border-black/5 shadow-[0_2px_4px_rgba(0,0,0,0.03),0_30px_80px_-30px_rgba(0,0,0,0.25)] animate-fade-in">
        <div className="text-center mb-7">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-[1.5rem] font-bold tracking-tight text-gray-900">{t('Choose a new password')}</h1>
          <p className="text-gray-500 mt-2 text-sm">
            {t('Your current password is temporary. Choose a new one that only you know to continue.')}
          </p>
        </div>
        <ChangePasswordForm
          submitLabel="Save and continue"
          onChanged={(token) => login({ ...user, mustChangePassword: false }, token)}
        />
        <button type="button" onClick={logout} className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700">
          {t('Log Out')}
        </button>
      </div>
    </div>
  );
}
