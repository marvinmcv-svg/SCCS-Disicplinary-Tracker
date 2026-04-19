"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestConsequence = suggestConsequence;
exports.analyzeIncidentTrend = analyzeIncidentTrend;
exports.generateReport = generateReport;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
async function suggestConsequence(violationType, category, description, previousIncidents) {
    const prompt = `You are a school discipline advisor. A student has committed a violation.
- Violation: ${violationType}
- Category: ${category}
- Description: ${description}
- Previous incidents count: ${previousIncidents}

Based on the violation type, category, and any pattern of repeated behavior, recommend an appropriate consequence. Consider:
1. The severity of the violation
2. Whether it's a first offense or repeated behavior
3. The standard consequences for this violation type
4. The student's best interest in terms of learning and behavior modification

Respond with a JSON object containing:
{
  "consequence": "recommended consequence",
  "daysOSS": number (0 if no OSS),
  "daysISS": number (0 if no ISS),
  "detentionHours": number,
  "rationale": "brief explanation"
}`;
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a school discipline advisor. Always respond with valid JSON.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        });
        return JSON.parse(completion.choices[0].message.content);
    }
    catch (error) {
        console.error('OpenAI error:', error);
        return null;
    }
}
async function analyzeIncidentTrend(studentId, incidents) {
    const incidentSummary = incidents.map(i => `- ${i.date}: ${i.violation_type} (${i.category})`).join('\n');
    const prompt = `Analyze the following discipline incidents for a student:
${incidentSummary}

Provide a JSON response with:
{
  "pattern": "any recurring pattern or behavior type",
  "riskLevel": "low/medium/high",
  "recommendations": ["specific recommendations for intervention"],
  "mtssTier": 1-3 (which MTSS tier intervention is recommended)
}`;
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a school MTSS (Multi-Tiered System of Supports) advisor. Analyze discipline data to recommend interventions. Always respond with valid JSON.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        });
        return JSON.parse(completion.choices[0].message.content);
    }
    catch (error) {
        console.error('OpenAI error:', error);
        return null;
    }
}
async function generateReport(incident, student, violation) {
    const prompt = `Generate a formal discipline referral report with the following information:
- Student: ${student.first_name} ${student.last_name} (Grade: ${student.grade})
- Date: ${incident.date}
- Violation: ${violation.violation_type} (${violation.category})
- Location: ${incident.location || 'Not specified'}
- Description: ${incident.description || 'Not provided'}
- Action Taken: ${incident.action_taken || 'Pending'}

Generate a professional, concise incident report formatted in plain text (not JSON).`;
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are a school administrator generating discipline reports. Write professionally and concisely.' },
                { role: 'user', content: prompt }
            ]
        });
        return completion.choices[0].message.content;
    }
    catch (error) {
        console.error('OpenAI error:', error);
        return null;
    }
}
