// Local "save password + biometric sign-in" support for the login page.
//
// Design (mirrors how native mobile apps and password managers work):
//   1. After a successful first login the user is offered to save their
//      credentials on this device (localStorage, obfuscated — see note below).
//   2. They can then enable BIOMETRIC sign-in: a WebAuthn platform
//      credential (fingerprint / Face ID / Windows Hello / device passkey)
//      that must be verified before the saved credentials are used again.
//   3. On return visits the login page offers one-tap "Continue as …"
//      (saved password) or "Sign in with biometrics" (WebAuthn unlock first).
//
// Security note: the password is stored OBFUSCATED (base64), not encrypted —
// it never leaves the device and is only used to call POST /auth/login, which
// is still fully validated server-side. The WebAuthn unlock adds a
// user-verification gate in front of the quick sign-in. Clearing saved data
// is one click ("Forget saved sign-in"), and a changed/rotated password makes
// the quick sign-in fail, which auto-clears the stale credentials.

const STORE_KEY = 'sccs_saved_auth';
const PREFS_KEY = 'sccs_auth_prefs';

export interface SavedAuth {
  username: string;
  password: string;
  displayName: string;
  biometricEnabled: boolean;
  credentialId: string | null;
  savedAt: number;
}

export interface AuthPrefs {
  neverAsk: boolean;
}

// ---------------------------------------------------------------------------
// Obfuscation helpers (NOT encryption — keeps casual shoulder-surfing and
// devtools casual inspection from showing a plaintext password)
// ---------------------------------------------------------------------------

function encodeSecret(plain: string): string {
  try {
    const bytes = new TextEncoder().encode(`v1:${plain}`);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
  } catch {
    return '';
  }
}

function decodeSecret(encoded: string): string {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const text = new TextDecoder().decode(bytes);
    return text.startsWith('v1:') ? text.slice(3) : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Saved credential storage
// ---------------------------------------------------------------------------

export function getSavedAuth(): SavedAuth | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.username !== 'string' || typeof parsed.p !== 'string') return null;
    return {
      username: parsed.username,
      password: decodeSecret(parsed.p),
      displayName: typeof parsed.displayName === 'string' && parsed.displayName ? parsed.displayName : parsed.username,
      biometricEnabled: !!parsed.biometricEnabled,
      credentialId: typeof parsed.credentialId === 'string' ? parsed.credentialId : null,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveCredentials(username: string, password: string, displayName: string): void {
  // Saving a new account replaces any previously saved one (last login wins,
  // exactly like a browser password manager updating an entry). Biometric
  // unlock is reset — it must be (re-)enabled for the new credentials.
  localStorage.setItem(STORE_KEY, JSON.stringify({
    username,
    p: encodeSecret(password),
    displayName: displayName || username,
    biometricEnabled: false,
    credentialId: null,
    savedAt: Date.now(),
  }));
}

export function setBiometric(username: string, credentialId: string): void {
  const saved = getSavedAuth();
  if (!saved || saved.username !== username) return;
  localStorage.setItem(STORE_KEY, JSON.stringify({
    ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}'),
    biometricEnabled: true,
    credentialId,
  }));
}

export function clearSavedAuth(): void {
  localStorage.removeItem(STORE_KEY);
}

// ---------------------------------------------------------------------------
// Preferences ("Never ask again on this device")
// ---------------------------------------------------------------------------

export function getPrefs(): AuthPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { neverAsk: false };
    const parsed = JSON.parse(raw);
    return { neverAsk: !!parsed?.neverAsk };
  } catch {
    return { neverAsk: false };
  }
}

export function setNeverAsk(value: boolean): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ neverAsk: value }));
}

// ---------------------------------------------------------------------------
// WebAuthn / biometric helpers (raw platform API — no dependencies)
// ---------------------------------------------------------------------------

function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(id: string): Uint8Array<ArrayBuffer> {
  const base64 = id.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True when this browser/device exposes a user-verifying platform authenticator. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) return false;
    const fn = (window.PublicKeyCredential as unknown as {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    }).isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof fn !== 'function') return false;
    return await fn.call(window.PublicKeyCredential);
  } catch {
    return false;
  }
}

/**
 * Register a platform (biometric) credential for this user on this device.
 * Returns the credential id (base64url) to store alongside the saved login.
 * Throws when the device has no authenticator or the user cancels the prompt.
 */
export async function createBiometricCredential(username: string): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = new TextEncoder().encode(`sccs:${username}`);
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      // rp.id omitted → defaults to the current origin's domain, so the
      // credential works on whichever HTTPS host the app is served from.
      rp: { name: 'SCCS Discipline Tracker' },
      user: { id: userId, name: username, displayName: username },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('credential creation cancelled');
  return bufferToBase64url(credential.rawId);
}

/**
 * Ask the device's biometric authenticator to verify the user (fingerprint,
 * face, Windows Hello…). Resolves true only when user verification succeeds.
 */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: base64urlToBuffer(credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  return !!assertion;
}
