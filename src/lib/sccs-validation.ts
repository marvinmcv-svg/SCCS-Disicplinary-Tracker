// Zod request-body schemas — port of sccs/server/validation.ts for the
// Next.js API routes. Deliberately forgiving about shape (unknown keys are
// dropped) and strict about content; '' becomes undefined and null means
// "clear the column".
import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === '' ? undefined : v));

const requiredText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

const gradeValue = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9-]/g, ''), 10)))
  .refine((n) => Number.isInteger(n) && n >= 0 && n <= 12, 'Grade must be between 0 (Pre-K) and 12');

const sectionValue = z
  .string()
  .trim()
  .toUpperCase()
  .max(4)
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const optionalEmail = z
  .union([z.literal(''), z.null(), z.email('Must be a valid email address').max(255)])
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const optionalPhone = z
  .union([
    z.string().trim().max(40).regex(/^[0-9+()\-.\s]*$/, 'Phone number contains invalid characters'),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const optionalDate = z
  .union([z.literal(''), z.null(), dateString])
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const optionalImage = z
  .union([
    z
      .string()
      .max(3_000_000, 'Image is too large — please use one under about 2MB')
      .refine(
        (v) => v === '' || v.startsWith('data:image/') || v.startsWith('http'),
        'Must be an image',
      ),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === '' ? undefined : v));

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

const optionalCodeValue = (label: string) =>
  z
    .union([z.string().trim().max(150, `${label} must be 150 characters or fewer`), z.null()])
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const incidentSchema = z.object({
  date: dateString,
  time: optionalText(10),
  student_id: z.coerce.number().int().positive('A student must be selected'),
  violation_id: z.coerce.number().int().positive('A violation type must be selected'),
  location: optionalText(150),
  description: requiredText(2000, 'Description'),
  witnesses: optionalText(1000),
  advisor: optionalText(120),
  action_taken: optionalText(2000),
  consequence: optionalText(2000),
  // PlusPortals (SIS) referral codes captured at registration.
  penalty: optionalCodeValue('Penalty code'),
  penalty_served: optionalCodeValue('Served status code'),
  days_iss: z.coerce.number('In-school suspension days must be a number').min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  days_oss: z.coerce.number('Out-of-school suspension days must be a number').min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  detention_hours: z.coerce.number('Detention hours must be a number').min(0, 'Hours cannot be negative').max(500, 'Hours value is implausibly large').optional(),
  notes: optionalText(5000),
  reported_by: requiredText(120, 'Reported by'),
  confirm_duplicate: z.boolean().optional(),
});

export const incidentUpdateSchema = z.object({
  status: z.enum(['Open', 'Pending', 'Resolved'], { error: 'Status must be Open, Pending or Resolved' }).optional(),
  parent_contacted: z.enum(['Yes', 'No'], { error: "Parent contacted must be 'Yes' or 'No'" }).optional(),
  contact_date: optionalDate,
  location: optionalText(150),
  description: optionalText(5000),
  witnesses: optionalText(1000),
  action_taken: optionalText(2000),
  consequence: optionalText(2000),
  penalty: optionalCodeValue('Penalty code'),
  penalty_served: optionalCodeValue('Served status code'),
  days_iss: z.coerce.number('In-school suspension days must be a number').min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  days_oss: z.coerce.number('Out-of-school suspension days must be a number').min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  detention_hours: z.coerce.number('Detention hours must be a number').min(0, 'Hours cannot be negative').max(500, 'Hours value is implausibly large').optional(),
  notes: optionalText(5000),
  follow_up_needed: z.enum(['Yes', 'No'], { error: "Follow-up needed must be 'Yes' or 'No'" }).optional(),
  follow_up_date: optionalDate,
  resolved_date: optionalDate,
  advisor: optionalText(120),
  reported_by: optionalText(120),
  violation_id: z.coerce.number('A violation type must be selected').int().positive('A violation type must be selected').optional(),
  points_deducted: z.coerce.number('Points must be a number').int().min(-200, 'Points cannot be below -200').max(0, 'Points deducted cannot be positive').optional(),
});

// PlusPortals discipline code sets (penalty / action / served / location).
export const disciplineCodeSchema = z.object({
  group: z.enum(['penalty', 'action', 'served', 'location'], { error: 'Code group must be penalty, action, served or location' }),
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(12, 'Code must be 12 characters or fewer')
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Code may contain only letters, numbers, dot, underscore and hyphen'),
  name: requiredText(100, 'Name'),
  description: optionalText(500),
  detention_hours: z.coerce.number('Detention hours must be a number').min(0, 'Hours cannot be negative').max(500, 'Hours value is implausibly large').optional(),
  days_iss: z.coerce.number('In-school suspension days must be a number').int().min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  days_oss: z.coerce.number('Out-of-school suspension days must be a number').int().min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  active: z.boolean().optional(),
  sort_order: z.coerce.number('Sort order must be a number').int().min(0).max(9999).optional(),
});

export const disciplineCodeUpdateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(12, 'Code must be 12 characters or fewer')
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Code may contain only letters, numbers, dot, underscore and hyphen')
    .optional(),
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer').optional(),
  description: optionalText(500),
  detention_hours: z.coerce.number('Detention hours must be a number').min(0, 'Hours cannot be negative').max(500, 'Hours value is implausibly large').optional(),
  days_iss: z.coerce.number('In-school suspension days must be a number').int().min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  days_oss: z.coerce.number('Out-of-school suspension days must be a number').int().min(0, 'Days cannot be negative').max(180, 'Days cannot exceed a school year').optional(),
  active: z.boolean().optional(),
  sort_order: z.coerce.number('Sort order must be a number').int().min(0).max(9999).optional(),
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

export const PLAN_TYPES = ['IEP', '504', 'ELL', 'BIP', 'Gifted', 'Health'] as const;
export const PLAN_STATUSES = ['Active', 'Under Review', 'Expired', 'Closed'] as const;
export const ACCOMMODATION_CATEGORIES = [
  'Presentation', 'Response', 'Setting', 'Timing', 'Behavioral', 'Assistive Technology',
] as const;
export const RECOGNITION_CATEGORIES = [
  'Respect', 'Responsibility', 'Integrity', 'Kindness', 'Leadership', 'Excellence',
] as const;

export const accommodationSchema = z.object({
  category: z.enum(ACCOMMODATION_CATEGORIES, { error: 'Choose an accommodation category' }),
  description: requiredText(500, 'Accommodation'),
  applies_to: optionalText(120),
  active: z.boolean().optional(),
});

export const supportPlanSchema = z.object({
  student_id: z.coerce.number().int().positive('A student must be selected'),
  plan_type: z.enum(PLAN_TYPES, { error: 'Plan type must be IEP, 504, ELL, BIP, Gifted or Health' }),
  primary_need: optionalText(200),
  case_manager: optionalText(120),
  start_date: dateString,
  review_date: optionalDate,
  status: z.enum(PLAN_STATUSES).optional(),
  behavior_considerations: optionalText(3000),
  parent_consent: z.boolean().optional(),
  notes: optionalText(5000),
  accommodations: z.array(accommodationSchema).max(40, 'A plan can list at most 40 accommodations').optional(),
});

export const recognitionSchema = z.object({
  student_id: z.coerce.number().int().positive('A student must be selected'),
  category: z.enum(RECOGNITION_CATEGORIES, { error: 'Choose a recognition category' }),
  points: z.coerce.number('Points must be a number').int().min(1, 'Points must be 1 to 5').max(5, 'Points must be 1 to 5').optional(),
  note: optionalText(500),
  date: dateString.optional(),
});

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/, 'Username may contain only letters, numbers, dot, underscore and hyphen'),
  password: passwordSchema,
  role: z
    .enum(['admin', 'principal', 'counselor', 'teacher', 'staff', 'parent', 'student', 'user'],
      { error: 'Role must be admin, principal, counselor, teacher, staff, parent, student or user' })
    .optional(),
  first_name: optionalText(100),
  last_name: optionalText(100),
  email: optionalEmail,
  phone: optionalPhone,
  classroom: optionalText(60),
  department: optionalText(80),
  advisory: optionalText(60),
});

/** Parse a request body against a schema; returns {data} or a 400-shaped error. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false as const,
      response: {
        error: Object.values(fieldErrors)[0] || 'The submitted data is not valid',
        fieldErrors,
      },
    };
  }
  return { ok: true as const, data: result.data as z.infer<T> };
}
