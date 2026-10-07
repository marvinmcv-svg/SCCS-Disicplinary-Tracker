// Fingerprint / Face ID / Windows Hello sign-in (WebAuthn passkeys), client side.
//
// The device's biometric lock guards a private key that never leaves it; the
// server stores only the public key (see src/lib/passkeys.ts). Nothing secret
// is kept in the browser: the only local value is a hint with the name of the
// person who set up fingerprint sign-in, so the login page can greet them.
//
// The previous version saved the password itself in localStorage and only
// "unlocked" it with the fingerprint; that data is wiped on first load.
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import api from './api';

const HINT_KEY = 'sccs_passkey_hint';
const PREFS_KEY = 'sccs_auth_prefs';
const LEGACY_KEY = 'sccs_saved_auth';

export interface PasskeyHint {
  username: string;
  displayName: string;
}

export function getPasskeyHint(): PasskeyHint | null {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.username === 'string' ? { username: parsed.username, displayName: parsed.displayName || parsed.username } : null;
  } catch {
    return null;
  }
}

export function setPasskeyHint(hint: PasskeyHint | null): void {
  try {
    if (hint) localStorage.setItem(HINT_KEY, JSON.stringify(hint));
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* storage unavailable: the login page just won't greet by name */
  }
}

/** Removes the old saved-password data from earlier versions of the app. */
export function clearLegacySavedPassword(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function getNeverAsk(): boolean {
  try {
    return !!JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')?.neverAsk;
  } catch {
    return false;
  }
}

export function setNeverAsk(value: boolean): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ neverAsk: value }));
  } catch {
    /* ignore */
  }
}

/** True when this device has a fingerprint / face / PIN authenticator. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (!browserSupportsWebAuthn()) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Adds fingerprint sign-in for the signed-in user on this device. */
export async function registerPasskey(): Promise<void> {
  const { data } = await api.post('/auth/passkey/register-options');
  const response = await startRegistration({ optionsJSON: data.options });
  await api.post('/auth/passkey/register', { challengeId: data.challengeId, response });
}

/** Signs in with the fingerprint; resolves to the same { token, user } as a password login. */
export async function signInWithPasskey(): Promise<{ token: string; user: any }> {
  const { data } = await api.post('/auth/passkey/login-options');
  const response = await startAuthentication({ optionsJSON: data.options });
  const res = await api.post('/auth/passkey/login', { challengeId: data.challengeId, response });
  return res.data;
}

/** A readable message for a WebAuthn failure (cancelled prompt, wrong site…). */
export function passkeyErrorMessage(error: any): string | null {
  const server = error?.response?.data?.error;
  if (server) return server;
  const name = error?.name || error?.cause?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return null; // the user cancelled
  if (name === 'InvalidStateError') return 'Fingerprint sign-in is already set up on this device.';
  if (name === 'SecurityError') return 'Fingerprint sign-in only works on the app’s main web address (HTTPS).';
  return 'Fingerprint sign-in is not available right now. Please use your password.';
}
