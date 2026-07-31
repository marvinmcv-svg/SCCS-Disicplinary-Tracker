import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';

/**
 * Request validation at the API boundary.
 *
 * Nothing previously checked request bodies. Endpoints destructured whatever
 * arrived and passed it to SQL with `field || ''` defaults, so a grade could be
 * a sentence, an email could be anything, and a 2MB string could land in a
 * TEXT column. Parameterised queries meant this was never SQL injection, but it
 * did mean the database filled with values the UI cannot render sensibly.
 *
 * Validation here is deliberately forgiving about *shape* (unknown keys are
 * dropped, not rejected, so an older mobile build sending an extra field keeps
 * working) and strict about *content*.
 */

/** Trims, and turns '' into undefined so optional text fields stay empty. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform(v => (v === '' ? undefined : v));

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

/**
 * Accepts a grade as a number or a string, including the '7A' form the import
 * path produces, and yields the numeric grade. Pre-K is 0, so a plain falsy
 * check would silently reject it.
 */
const gradeValue = z
  .union([z.number(), z.string()])
  .transform(v => (typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9-]/g, ''), 10)))
  .refine(n => Number.isInteger(n) && n >= 0 && n <= 12, 'Grade must be between 0 (Pre-K) and 12');

const sectionValue = z
  .string()
  .trim()
  .toUpperCase()
  .max(4)
  .optional()
  .transform(v => (v === '' ? undefined : v));

/** An email that may be blank — many student records have no parent address. */
const optionalEmail = z
  .union([z.literal(''), z.email('Must be a valid email address').max(255)])
  .optional()
  .transform(v => (v === '' ? undefined : v));

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[0-9+()\-.\s]*$/, 'Phone number contains invalid characters')
  .optional()
  .transform(v => (v === '' ? undefined : v));

/** ISO date, as the schema stores dates in TEXT columns. */
const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const optionalDate = z
  .union([z.literal(''), dateString])
  .optional()
  .transform(v => (v === '' ? undefined : v));

/**
 * Profile pictures arrive as data URIs. The body parser caps requests at 20MB;
 * this keeps a single image well under that and rejects a non-image payload.
 */
const optionalImage = z
  .string()
  .max(3_000_000, 'Image is too large — please use one under about 2MB')
  .refine(
    v => v === '' || v.startsWith('data:image/') || v.startsWith('http'),
    'Must be an image'
  )
  .optional()
  .transform(v => (v === '' ? undefined : v));

export const studentSchema = z.object({
  student_id: requiredText(32, 'Student ID'),
  last_name: requiredText(100, 'Last name'),
  first_name: requiredText(100, 'First name'),
  grade: gradeValue.optional(),
  section: sectionValue,
  house_team: optionalText(60),
  counselor: optionalText(120),
  advisory: optionalText(60),
  gpa: z.coerce.number('GPA must be a number').min(0, 'GPA cannot be negative').max(5, 'GPA cannot be above 5').optional(),
  total_points: z.coerce
    .number('Conduct points must be a number')
    .int()
    .min(-1000, 'Conduct points cannot be below -1000')
    .max(1000, 'Conduct points cannot be above 1000')
    .optional(),
  conduct_status: optionalText(40),
  observations: optionalText(5000),
  date_of_birth: optionalDate,
  parent_name: optionalText(150),
  parent_phone: optionalPhone,
  parent_email: optionalEmail,
  gender: optionalText(30),
  profile_picture: optionalImage,
});

export const incidentSchema = z.object({
  date: dateString,
  time: optionalText(10),
  student_id: z.coerce.number().int().positive('A student must be selected'),
  violation_id: z.coerce.number().int().positive('A violation type must be selected'),
  location: optionalText(150),
  description: optionalText(5000),
  witnesses: optionalText(1000),
  advisor: optionalText(120),
  action_taken: optionalText(2000),
  consequence: optionalText(2000),
  notes: optionalText(5000),
  reported_by: optionalText(120),
});

export const incidentUpdateSchema = z.object({
  // Exactly the three values the UI and the dashboard queries use. 'Closed' is
  // deliberately absent — nothing in the app produces or reads it, and allowing
  // it would create incidents the "open incidents" count silently ignores.
  status: z.enum(['Open', 'Pending', 'Resolved'], 'Status must be Open, Pending or Resolved').optional(),
  parent_contacted: z.enum(['Yes', 'No'], "Parent contacted must be 'Yes' or 'No'").optional(),
  contact_date: optionalDate,
  location: optionalText(150),
  description: optionalText(5000),
  witnesses: optionalText(1000),
  action_taken: optionalText(2000),
  consequence: optionalText(2000),
  days_iss: z.coerce.number('In-school suspension days must be a number').min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  days_oss: z.coerce.number('Out-of-school suspension days must be a number').min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  detention_hours: z.coerce.number('Detention hours must be a number').min(0, 'Hours cannot be negative').max(500, 'Hours value is implausibly large').optional(),
  notes: optionalText(5000),
  follow_up_needed: z.enum(['Yes', 'No'], "Follow-up needed must be 'Yes' or 'No'").optional(),
  follow_up_date: optionalDate,
  resolved_date: optionalDate,
  advisor: optionalText(120),
});

export const mtssSchema = z.object({
  student_id: z.coerce.number().int().positive('A student must be selected'),
  tier: z.coerce.number('Tier must be a number').int().min(1, 'Tier must be 1, 2 or 3').max(3, 'Tier must be 1, 2 or 3'),
  intervention: requiredText(500, 'Intervention'),
  start_date: dateString,
  end_date: optionalDate,
  progress: optionalText(60),
  notes: optionalText(5000),
  intervention_goal: optionalText(2000),
  progress_monitoring: optionalText(2000),
  review_date: optionalDate,
  exit_criteria: optionalText(2000),
  advisor: optionalText(120),
});

/**
 * Passwords must survive a school year of shoulder-surfing and shared
 * workstations. Matches the rules the reset endpoint already enforced, so a
 * password set one way cannot be rejected by the other.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/, 'Username may contain only letters, numbers, dot, underscore and hyphen'),
  password: passwordSchema,
  role: z.enum(['admin', 'counselor', 'teacher', 'user'], 'Role must be admin, counselor, teacher or user').optional(),
  first_name: optionalText(100),
  last_name: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  classroom: optionalText(60),
  department: optionalText(80),
  advisory: optionalText(60),
});

/**
 * Express middleware that validates `req.body` and replaces it with the parsed
 * result, so handlers receive trimmed, correctly-typed values.
 *
 * Returns 400 with per-field messages the UI can show next to the input,
 * rather than a single opaque string.
 */
export function validateBody<T extends ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        // Keep the first message per field; later ones are usually consequences.
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return res.status(400).json({
        error: Object.values(fieldErrors)[0] || 'The submitted data is not valid',
        fieldErrors,
      });
    }

    req.body = result.data;
    next();
  };
}
