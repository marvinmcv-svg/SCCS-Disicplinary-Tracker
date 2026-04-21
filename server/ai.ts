import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

let openai: OpenAI | null = null;

try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-cp-eOBHtUuFs7bHZr96OtcSsul7yKKlYMqHBWnwR08i1hUv95yepqRs_IQbqfSYecrzD4RpTBE1pQ3pgGCzQ6pAMKF_UfLGuOx__3QnoG0TK4E2ibM6tIsqDZg',
    baseURL: 'https://api.minimax.chat/v1'
  });
  console.log('AI module initialized successfully');
} catch (err) {
  console.error('Failed to initialize AI module:', err);
}

function getFallbackConsequence(violationType: string, category: string, previousIncidents: number) {
  const defaults: Record<string, { consequence: string; daysOSS: number; daysISS: number; detentionHours: number }> = {
    'Tardy to School': { consequence: 'Warning', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Tardy to Class': { consequence: 'Warning', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Unexcused Absence': { consequence: 'Detention', daysOSS: 0, daysISS: 0, detentionHours: 1 },
    'Class Cut/AWOL': { consequence: 'Saturday School', daysOSS: 0, daysISS: 0, detentionHours: 4 },
    'Classroom Disruption': { consequence: 'Warning', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Insubordination': { consequence: 'Detention', daysOSS: 0, daysISS: 0, detentionHours: 1 },
    'Defiant Behavior': { consequence: 'ISS', daysOSS: 0, daysISS: 1, detentionHours: 0 },
    'Inappropriate Language': { consequence: 'Warning', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Physical Altercation': { consequence: 'OSS', daysOSS: 1, daysISS: 0, detentionHours: 0 },
    'Fighting': { consequence: 'OSS', daysOSS: 3, daysISS: 0, detentionHours: 0 },
    'Cheating': { consequence: 'Zero', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Plagiarism': { consequence: 'Zero', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Dress Code Violation': { consequence: 'Warning', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Tobacco Possession': { consequence: '3-Day OSS', daysOSS: 3, daysISS: 0, detentionHours: 0 },
    'Vaping': { consequence: '3-Day OSS', daysOSS: 3, daysISS: 0, detentionHours: 0 },
    'Bullying': { consequence: 'OSS', daysOSS: 3, daysISS: 0, detentionHours: 0 },
    'Threats': { consequence: 'OSS', daysOSS: 5, daysISS: 0, detentionHours: 0 },
    'Weapons Possession': { consequence: 'Expulsion', daysOSS: 10, daysISS: 0, detentionHours: 0 },
    'Theft': { consequence: 'OSS', daysOSS: 2, daysISS: 0, detentionHours: 0 },
    'Vandalism': { consequence: 'OSS', daysOSS: 2, daysISS: 0, detentionHours: 0 },
    'AUP Violation': { consequence: 'Warning', daysOSS: 0, daysISS: 0, detentionHours: 0 },
    'Fire Alarm Misuse': { consequence: 'OSS', daysOSS: 1, daysISS: 0, detentionHours: 0 },
  };

  const fallback = { consequence: 'Detention', daysOSS: 0, daysISS: 1, detentionHours: 0, rationale: 'Default consequence based on category' };
  const key = Object.keys(defaults).find(k => violationType.toLowerCase().includes(k.toLowerCase()));
  
  if (key) {
    const d = defaults[key];
    return {
      consequence: d.consequence,
      daysOSS: d.daysOSS,
      daysISS: d.daysISS,
      detentionHours: d.detentionHours,
      rationale: previousIncidents > 2 ? 'Repeated behavior - escalated response' : 'Standard consequence applied'
    };
  }
  
  return fallback;
}

export async function suggestConsequence(violationType: string, category: string, description: string, previousIncidents: number) {
  if (!openai) {
    console.log('AI not available, using fallback');
    return getFallbackConsequence(violationType, category, previousIncidents);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'MiniMax-01',
      messages: [
        { role: 'system', content: 'You are a school discipline advisor. Always respond with valid JSON only.' },
        { role: 'user', content: `Recommend consequence for violation: ${violationType}, Category: ${category}, Previous incidents: ${previousIncidents}. Respond with JSON only.` }
      ],
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      return JSON.parse(content);
    }
  } catch (error: any) {
    console.log('AI suggestion failed, using fallback:', error.message);
  }
  
  return getFallbackConsequence(violationType, category, previousIncidents);
}

export async function analyzeIncidentTrend(studentId: number, incidents: any[]) {
  if (!openai) {
    console.log('AI not available, using fallback');
    return { pattern: 'Isolated incidents', riskLevel: 'low', recommendations: ['Monitor behavior'], mtssTier: 1 };
  }

  try {
    const incidentSummary = incidents.map(i => `${i.date}: ${i.violation_type}`).join('; ');
    const completion = await openai.chat.completions.create({
      model: 'MiniMax-01',
      messages: [
        { role: 'system', content: 'You are a school MTSS advisor. Always respond with JSON only.' },
        { role: 'user', content: `Analyze incidents: ${incidentSummary}. Respond with JSON only.` }
      ],
      response_format: { type: 'json_object' }
    });

    const content = completion.choices[0]?.message?.content;
    if (content) {
      return JSON.parse(content);
    }
  } catch (error: any) {
    console.log('AI analysis failed, using fallback:', error.message);
  }
  
  const count = incidents.length;
  return {
    pattern: count > 3 ? 'Repeated violations' : 'Isolated incidents',
    riskLevel: count > 5 ? 'high' : count > 2 ? 'medium' : 'low',
    recommendations: count > 3 ? ['Consider MTSS Tier 2 intervention', 'Parent conference recommended'] : ['Monitor behavior', 'Provide support as needed'],
    mtssTier: count > 4 ? 2 : 1
  };
}

export async function generateReport(incident: any, student: any, violation: any) {
  if (!openai) {
    console.log('AI not available, using fallback');
    return `INCIDENT REPORT\nDate: ${incident.date}\nStudent: ${student.first_name} ${student.last_name} (Grade ${student.grade})\nViolation: ${violation.violation_type}\nCategory: ${violation.category}`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'MiniMax-01',
      messages: [
        { role: 'system', content: 'You are a school administrator. Write professional text reports only.' },
        { role: 'user', content: `Generate incident report: Student ${student.first_name} ${student.last_name}, ${violation.violation_type}, ${incident.date}. Write plain text only.` }
      ]
    });

    return completion.choices[0]?.message?.content || 'Report generation unavailable.';
  } catch (error: any) {
    console.log('AI report failed, using fallback:', error.message);
  }
  
  return `INCIDENT REPORT\nDate: ${incident.date}\nStudent: ${student.first_name} ${student.last_name} (Grade ${student.grade})\nViolation: ${violation.violation_type}\nCategory: ${violation.category}\nLocation: ${incident.location || 'Not specified'}\nDescription: ${incident.description || 'None provided'}\nAction Taken: ${incident.action_taken || 'Pending review'}`;
}