// Change your own password (current + new + confirm), through
// /api/auth/change-password. Used by the required first-sign-in screen, the
// family page and your own profile.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { passwordProblem } from '@/lib/sccs-passwords';
import api from '../lib/api';
import PasswordInput from './PasswordInput';
import { useI18n } from '../i18n';

export default function ChangePasswordForm({
  onChanged,
  submitLabel = 'Change Password',
}: {
  /** Called with the fresh session token: every older session has ended. */
  onChanged: (token: string) => void;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = passwordProblem(next);
    if (problem) return setError(t(problem));
    if (next !== confirm) return setError(t('Passwords do not match'));

    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged(res.data.token);
    } catch (err: any) {
      setError(t(err.response?.data?.error || 'Password change failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="change-password-form">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm" role="alert">
          {error}
        </div>
      )}
      <div>
        <label className="form-label">{t('Current Password')}</label>
        <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="current-password" />
      </div>
      <div>
        <label className="form-label">{t('New Password')}</label>
        <PasswordInput
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder={t('Min 8 chars, 1 number, 1 special char')}
          data-testid="new-password"
        />
      </div>
      <div>
        <label className="form-label">{t('Confirm New Password')}</label>
        <PasswordInput
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t('Re-enter password')}
          data-testid="confirm-password"
        />
      </div>
      <button type="submit" disabled={saving} className="btn btn-primary w-full justify-center py-3">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {t(submitLabel)}
      </button>
    </form>
  );
}
