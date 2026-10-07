// Fingerprint sign-in, inside the app: a one-tap "Set up" row for the sidebar
// and phone menu, and a full list (with remove) for Settings.
import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Loader2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../App';
import { useI18n } from '../i18n';
import { getPasskeyHint, isBiometricAvailable, passkeyErrorMessage, registerPasskey, setPasskeyHint } from '../lib/savedAuth';
import { formatShortDate } from './kit';

interface PasskeyRow { id: number; device_label: string | null; rp_id: string; created_at: string; last_used_at: string | null }

function useFingerprintSetup() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [setUpHere, setSetUpHere] = useState(() => getPasskeyHint()?.username === user?.username);

  useEffect(() => { isBiometricAvailable().then(setAvailable); }, []);

  const setUp = async (after?: () => void) => {
    setBusy(true);
    setMessage(null);
    try {
      await registerPasskey();
      setPasskeyHint({ username: user.username, displayName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username });
      setSetUpHere(true);
      setMessage({ kind: 'ok', text: t('Fingerprint sign-in is ready. Use it next time.') });
      after?.();
    } catch (err) {
      const text = passkeyErrorMessage(err);
      if (text) setMessage({ kind: 'error', text: t(text) });
    } finally {
      setBusy(false);
    }
  };
  return { available, busy, message, setUpHere, setUp };
}

/** Sidebar / phone-menu row; hidden when unsupported or already set up here. */
export function FingerprintSetupRow() {
  const { t } = useI18n();
  const { available, busy, message, setUpHere, setUp } = useFingerprintSetup();
  if (!available || (setUpHere && message?.kind !== 'ok')) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setUp()}
        disabled={busy || setUpHere}
        className="flex items-center gap-2 w-full px-3 py-2 text-blue-600 hover:bg-[var(--fill-hover)] rounded-[9px] transition-colors text-sm font-medium"
      >
        {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Fingerprint className="w-[18px] h-[18px]" />}
        <span>{setUpHere ? t('Fingerprint sign-in is on') : t('Set up fingerprint sign-in')}</span>
      </button>
      {message?.kind === 'error' && <p className="px-3 text-xs text-red-600">{message.text}</p>}
    </div>
  );
}

/** Settings card section: devices with fingerprint sign-in, add and remove. */
export function FingerprintSettings() {
  const { t, lang } = useI18n();
  const { available, busy, message, setUpHere, setUp } = useFingerprintSetup();
  const [rows, setRows] = useState<PasskeyRow[]>([]);

  const load = useCallback(() => {
    api.get<PasskeyRow[]>('/auth/passkeys').then((r) => setRows(r.data)).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: number) => {
    if (!confirm(t('Remove fingerprint sign-in from this device?'))) return;
    await api.delete(`/auth/passkeys/${id}`).catch(() => undefined);
    load();
  };

  return (
    <div data-testid="fingerprint-settings">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-700 flex items-center gap-2"><Fingerprint className="w-4 h-4" /> {t('Fingerprint sign-in')}</p>
          <p className="text-sm text-gray-500">
            {available ? t('Sign in with your fingerprint or face on this device.') : t('This device has no fingerprint or face sensor the browser can use.')}
          </p>
        </div>
        {available && !setUpHere && (
          <button type="button" className="btn btn-secondary" onClick={() => setUp(load)} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />} {t('Set up on this device')}
          </button>
        )}
      </div>
      {message && <div className={`callout mt-3 ${message.kind === 'ok' ? 'callout-info' : 'callout-danger'}`}>{message.text}</div>}
      {rows.length > 0 && (
        <ul className="list-inset mt-3">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{r.device_label || t('Device')}</p>
                <p className="text-xs text-gray-500">
                  {t('Added {date}', { date: formatShortDate(r.created_at, lang) })}
                  {r.last_used_at && ` · ${t('Last used {date}', { date: formatShortDate(r.last_used_at, lang) })}`}
                </p>
              </div>
              <button type="button" className="icon-btn" aria-label={t('Remove')} onClick={() => remove(r.id)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
