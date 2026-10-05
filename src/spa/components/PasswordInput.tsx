import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../i18n';

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  'data-testid'?: string;
}

/**
 * Password field with a show/hide "eye" toggle.
 *
 * Typing a managed password (especially an auto-filled one) blind is the
 * top source of "login doesn't work" reports — the toggle lets the user
 * verify exactly what is in the box before signing in, without exposing
 * it by default. Accessible: the button is a real button with a localized
 * label, so screen readers and keyboard users get the same control.
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  required = true,
  onKeyDown,
  'data-testid': testId,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();

  return (
    <div className="relative">
      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        required={required}
        data-testid={testId}
        className="input pl-12 pr-12"
        placeholder={placeholder}
        autoComplete={visible ? 'off' : 'current-password'}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? t('Hide password') : t('Show password')}
        title={visible ? t('Hide password') : t('Show password')}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
      >
        {visible ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
