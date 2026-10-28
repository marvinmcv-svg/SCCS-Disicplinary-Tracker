// Password rules shared by every route that sets a password, and the seeded
// passwords that are public (they are in this repository's history), which an
// account must never keep.

/**
 * Passwords the seed has ever given accounts. Any account still using one is
 * made to choose a new password at its next sign-in (see prisma/seed.ts), and
 * none of them is accepted as a new password.
 */
export const PUBLISHED_PASSWORDS: readonly string[] = [
  'admin123',
  'Teacher!2026',
  'Carlos123456!',
  'Daniel123456!',
  'Counselor!2026',
  'Principal!2026',
  'Staff!2026',
  'Parent!2026',
  'Parent2!2026',
  'Pending!2026',
  'Student!2026',
];

/** The error to show for a proposed password, or null when it is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  if (PUBLISHED_PASSWORDS.includes(password)) {
    return 'This password is publicly known. Choose a different one.';
  }
  return null;
}
