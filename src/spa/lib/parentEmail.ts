// The "Send to Parent" email for an incident. SCCS is bilingual, so the
// message is written in Spanish first and then in English. Database values
// (violation type, category, location, consequence…) are stored in English
// and translated for the Spanish half with the app's dictionary.
import { dictionary } from '../i18n-dictionary';

export interface ParentEmailIncident {
  incident_id?: string;
  first_name?: string;
  last_name?: string;
  date: string;
  time?: string | null;
  violation_type?: string;
  category?: string;
  location?: string | null;
  description?: string | null;
  action_taken?: string | null;
  penalty?: string | null;
  penalty_served?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
}

const es = (value: string) => dictionary[value] ?? value;

/** "HALL — Hallway" → "HALL — Pasillo"; plain values are translated whole. */
function esValue(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const parts = value.split(' — ');
  if (parts.length === 2) return `${parts[0]} — ${es(parts[1])}`;
  return es(value);
}

function longDate(iso: string, locale: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export function buildParentEmail(i: ParentEmailIncident): { to: string; subject: string; body: string } {
  const student = `${i.first_name ?? ''} ${i.last_name ?? ''}`.trim();
  const parent = i.parent_name?.trim();

  const spanish = [
    parent ? `Estimado/a ${parent}:` : 'Estimada familia:',
    '',
    `Le informamos que se registró un incidente en SCCS relacionado con su hijo/a, ${student}.`,
    '',
    'Detalles del incidente:',
    `- Fecha: ${longDate(i.date, 'es-ES')}${i.time ? `, ${i.time}` : ''}`,
    `- Tipo: ${esValue(i.violation_type, 'No indicado')}`,
    `- Categoría: ${esValue(i.category, 'No indicada')}`,
    `- Lugar: ${esValue(i.location, 'No indicado')}`,
    `- Descripción: ${i.description || 'No indicada'}`,
    `- Medida tomada: ${esValue(i.action_taken, 'En revisión')}`,
    `- Consecuencia: ${esValue(i.penalty, 'Ninguna')}`,
    `- Cumplida: ${esValue(i.penalty_served, 'No aplica')}`,
    '',
    'Si tiene alguna pregunta, no dude en comunicarse con el colegio.',
    '',
    'Atentamente,',
    'Administración de SCCS',
  ];

  const english = [
    parent ? `Dear ${parent},` : 'Dear Parent/Guardian,',
    '',
    `This is to inform you that an incident involving your child, ${student}, was recorded at SCCS.`,
    '',
    'Incident details:',
    `- Date: ${longDate(i.date, 'en-US')}${i.time ? `, ${i.time}` : ''}`,
    `- Type: ${i.violation_type || 'Not given'}`,
    `- Category: ${i.category || 'Not given'}`,
    `- Location: ${i.location || 'Not given'}`,
    `- Description: ${i.description || 'Not given'}`,
    `- Action taken: ${i.action_taken || 'Under review'}`,
    `- Consequence: ${i.penalty || 'None'}`,
    `- Served: ${i.penalty_served || 'N/A'}`,
    '',
    'Please contact the school if you have any questions.',
    '',
    'Sincerely,',
    'SCCS Administration',
  ];

  return {
    to: i.parent_email?.trim() ?? '',
    subject: `Notificación de incidente / Incident notification – ${student}`,
    body: [...spanish, '', '— — — — — — — — — —', 'ENGLISH VERSION', '— — — — — — — — — —', '', ...english].join('\n'),
  };
}

/**
 * Gmail's compose window, prefilled. Without an account number in the path
 * Gmail opens it in the browser's current Google account (the one last
 * signed in), and asks to sign in if there is none.
 */
export function parentEmailGmailUrl(i: ParentEmailIncident): string {
  const { to, subject, body } = buildParentEmail(i);
  // encodeURIComponent (spaces as %20, not "+") so every mail client reads it the same way.
  const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
  return `https://mail.google.com/mail/?${[q('view', 'cm'), q('fs', '1'), q('to', to), q('su', subject), q('body', body)].join('&')}`;
}

/** Phones and tablets hand mailto: links to their mail app; desktops often have none set up. */
export function prefersMailApp(): boolean {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return mobile || window.matchMedia('(pointer: coarse)').matches;
}

export function parentEmailMailto(i: ParentEmailIncident): string {
  const { to, subject, body } = buildParentEmail(i);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
