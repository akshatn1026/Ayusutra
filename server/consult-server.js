const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { supabase } = require('./lib/supabase');
const authMiddleware = require('./middleware/auth.middleware');
const authRequired = authMiddleware;

const consultationRoutes = require('./routes/consultation.routes');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile();

const PORT = process.env.CONSULT_PORT ? Number(process.env.CONSULT_PORT) : 4000;

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/consultations', consultationRoutes);

// Auth /me — top-level route for fast token validation
app.get(['/api/auth/me', '/auth/me'], async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const result = await supabase.auth.getUser(token);
    if (result.error || !result.data?.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const authUser = result.data.user;

    // Try to get enriched profile from public.users table
    const { data: profile } = await supabase
      .from('users')
      .select('id, name, email, role, phone')
      .eq('id', authUser.id)
      .single();

    // Return the profile if found, or build one from auth user metadata
    const user = profile || {
      id: authUser.id,
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
      email: authUser.email,
      role: authUser.user_metadata?.role || 'patient',
      phone: authUser.user_metadata?.phone || ''
    };

    return res.status(200).json({ user });
  } catch (err) {
    console.error('🔥 /me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const server = http.createServer(app);
// Socket.IO server removed - migrated to Supabase Realtime

const sessions = new Map();
const medicineCache = new Map();
const medicineDetailCache = new Map();
const rateWindowMs = 60 * 1000;
const maxRequestsPerWindow = 40;
const rateStore = new Map();
const MEDICAL_REPORT_MAX_BYTES = 10 * 1024 * 1024;
const MEDICAL_REPORT_UPLOAD_DIR = path.join(__dirname, 'secure_uploads', 'medical_reports');
const ALLOWED_MEDICAL_REPORT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const ALLOWED_MEDICAL_REPORT_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MEDICAL_ANALYSIS_DISCLAIMER =
  'This AI explanation is for educational purposes only and should not replace professional medical advice.';

fs.mkdirSync(MEDICAL_REPORT_UPLOAD_DIR, { recursive: true });

const dbPath = path.join(__dirname, 'ayusutra.sqlite');
// Core initialization and seeding are now handled via Supabase Dashboard / SQL Editor (schema.sql)


function safeJsonParseArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// Doctor profiling and availability seeding is now handled via Supabase Dashboard / SQL Editor




function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || '';
}

function normalizePhone(value) {
  return String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');
}

function normalizeIdentifier(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return normalizeEmail(raw);
  return normalizePhone(raw);
}

function generateOtpCode() {
  const value = crypto.randomInt(0, 1000000);
  return String(value).padStart(6, '0');
}



// Transaction logic is now handled by Supabase/PostgreSQL directly

function cleanupExpiredAuthData() {
  // SQLite cleanup logic removed as we move to Supabase
}

async function sendConsultationSms(phone, message) {
  if (!phone) return;
  const smsWebhook = String(process.env.SMS_WEBHOOK_URL || '').trim();
  if (smsWebhook) {
    const response = await fetch(smsWebhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: phone, message })
    });
    if (!response.ok) throw new Error(`SMS delivery failed with HTTP ${response.status}`);
    return;
  }
  console.info(`[consultation] SMS notification for ${phone}: ${message}`);
}



function validatePasswordRules(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
  return '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return false;
  return /^\+?[0-9]{8,15}$/.test(phone);
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return {
    ...data,
    isVerified: data.is_verified,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    tokenVersion: data.token_version
  };
}

async function getUserAuthById(id) {
  return getUserById(id);
}

function optionalAuth(req) {
  return req.user?.id || null;
}

const MEDICAL_TEST_CATALOG = [
  {
    id: 'hemoglobin',
    name: 'Hemoglobin',
    keywords: ['hemoglobin', 'haemoglobin', 'hb'],
    unit: 'g/dL',
    range: { low: 13, high: 17 },
    about: 'Hemoglobin helps carry oxygen through the blood.',
    lowCauses: ['Iron deficiency', 'Low vitamin intake', 'Blood loss'],
    highCauses: ['Dehydration', 'Smoking exposure', 'Chronic low-oxygen conditions'],
    lowSuggestions: ['Add iron-rich foods', 'Check B12 and folate levels', 'Discuss fatigue symptoms with your doctor'],
    highSuggestions: ['Improve hydration', 'Avoid smoking', 'Consult your doctor if levels remain high']
  },
  {
    id: 'rbc',
    name: 'RBC',
    keywords: ['rbc', 'red blood cell', 'red blood cells'],
    unit: 'million/uL',
    range: { low: 4.2, high: 5.9 },
    about: 'RBC count reflects oxygen-carrying blood cells.',
    lowCauses: ['Anemia', 'Nutritional deficiency', 'Recent blood loss'],
    highCauses: ['Dehydration', 'Smoking', 'Lung or heart strain'],
    lowSuggestions: ['Improve iron, folate, and B12 intake', 'Repeat CBC if symptoms persist', 'Seek clinician advice for persistent weakness'],
    highSuggestions: ['Hydrate well', 'Review lifestyle risks', 'Get clinical follow-up for persistent elevation']
  },
  {
    id: 'wbc',
    name: 'WBC',
    keywords: ['wbc', 'white blood cell', 'total leucocyte count', 'tlc'],
    unit: 'x10^3/uL',
    range: { low: 4, high: 11 },
    about: 'WBC count indicates immune-system activity.',
    lowCauses: ['Recent viral illness', 'Nutritional deficiency', 'Medication effects'],
    highCauses: ['Infection', 'Inflammation', 'Stress response'],
    lowSuggestions: ['Maintain nutrition and hydration', 'Review medicines with a doctor', 'Seek care for persistent fever or weakness'],
    highSuggestions: ['Track signs of infection', 'Hydrate and rest', 'Consult a doctor if persistent']
  },
  {
    id: 'platelets',
    name: 'Platelets',
    keywords: ['platelet', 'platelets', 'platelet count'],
    unit: 'x10^3/uL',
    range: { low: 150, high: 450 },
    about: 'Platelets are important for blood clotting.',
    lowCauses: ['Viral infections', 'Nutritional deficiency', 'Bone marrow suppression'],
    highCauses: ['Inflammation', 'Iron deficiency', 'Reactive rise after infection'],
    lowSuggestions: ['Avoid injury risk', 'Follow up with a doctor for bleeding signs', 'Check repeat count if advised'],
    highSuggestions: ['Maintain hydration', 'Address underlying inflammation', 'Discuss persistent high counts with your doctor']
  },
  {
    id: 'blood_sugar',
    name: 'Blood Sugar',
    keywords: ['blood sugar', 'glucose', 'fbs', 'fasting glucose'],
    unit: 'mg/dL',
    range: { low: 70, high: 99 },
    about: 'Blood sugar reflects how your body handles glucose.',
    lowCauses: ['Long fasting', 'Excess glucose-lowering medication', 'Poor meal timing'],
    highCauses: ['Insulin resistance', 'High carbohydrate intake', 'Stress hormones'],
    lowSuggestions: ['Do not skip meals', 'Carry quick carbohydrate snacks', 'Review medicines with your doctor'],
    highSuggestions: ['Limit refined sugars', 'Exercise regularly', 'Consider medical screening for diabetes']
  },
  {
    id: 'cholesterol',
    name: 'Cholesterol',
    keywords: ['cholesterol', 'total cholesterol'],
    unit: 'mg/dL',
    range: { low: 125, high: 200 },
    about: 'Total cholesterol helps estimate cardiovascular risk.',
    lowCauses: ['Strict calorie restriction', 'Poor nutrition', 'Chronic illness'],
    highCauses: ['Diet high in saturated fats', 'Sedentary lifestyle', 'Genetic factors'],
    lowSuggestions: ['Maintain balanced nutrition', 'Discuss unexplained low levels with your doctor', 'Review thyroid and liver status if needed'],
    highSuggestions: ['Reduce fried and processed foods', 'Increase fiber intake', 'Consult your doctor for lipid management']
  },
  {
    id: 'vitamin_d',
    name: 'Vitamin D',
    keywords: ['vitamin d', '25-oh vitamin d', '25 hydroxy vitamin d'],
    unit: 'ng/mL',
    range: { low: 30, high: 100 },
    about: 'Vitamin D supports bone strength and immune health.',
    lowCauses: ['Low sun exposure', 'Dietary insufficiency', 'Absorption issues'],
    highCauses: ['Excess supplementation', 'Dose miscalculation', 'Unsupervised therapy'],
    lowSuggestions: ['Increase safe sunlight exposure', 'Add vitamin D-rich foods', 'Discuss supplementation with your doctor'],
    highSuggestions: ['Stop unsupervised supplements', 'Recheck level after clinician guidance', 'Hydrate and review calcium intake']
  },
  {
    id: 'vitamin_b12',
    name: 'Vitamin B12',
    keywords: ['vitamin b12', 'b12'],
    unit: 'pg/mL',
    range: { low: 200, high: 900 },
    about: 'Vitamin B12 is essential for nerves and blood formation.',
    lowCauses: ['Low animal-protein intake', 'Malabsorption', 'Gastric disorders'],
    highCauses: ['High supplementation', 'Recent injections', 'Liver-related issues'],
    lowSuggestions: ['Include B12-rich foods', 'Discuss supplements if vegetarian', 'Seek medical advice for numbness or fatigue'],
    highSuggestions: ['Review supplement dose', 'Retest if levels remain elevated', 'Consult your doctor for interpretation']
  },
  {
    id: 'tsh',
    name: 'Thyroid (TSH)',
    keywords: ['tsh', 'thyroid stimulating hormone'],
    unit: 'uIU/mL',
    range: { low: 0.4, high: 4.0 },
    about: 'TSH helps monitor thyroid hormone regulation.',
    lowCauses: ['Overactive thyroid', 'Excess thyroid medication', 'Pituitary causes'],
    highCauses: ['Underactive thyroid', 'Autoimmune thyroid disease', 'Iodine imbalance'],
    lowSuggestions: ['Consult endocrinology if symptomatic', 'Review thyroid medicines', 'Repeat thyroid panel as advised'],
    highSuggestions: ['Check free T3/T4 with your doctor', 'Monitor weight/energy changes', 'Discuss thyroid treatment options']
  },
  {
    id: 'creatinine',
    name: 'Creatinine',
    keywords: ['creatinine', 'serum creatinine'],
    unit: 'mg/dL',
    range: { low: 0.6, high: 1.3 },
    about: 'Creatinine helps evaluate kidney function.',
    lowCauses: ['Low muscle mass', 'Poor nutrition', 'Pregnancy-related changes'],
    highCauses: ['Kidney stress', 'Dehydration', 'Medication effects'],
    lowSuggestions: ['Maintain balanced protein intake', 'Track trends over time', 'Discuss concern if persistent'],
    highSuggestions: ['Hydrate adequately', 'Avoid unnecessary nephrotoxic medicines', 'Consult a doctor for kidney evaluation']
  },
  {
    id: 'alt',
    name: 'Liver Enzyme (ALT)',
    keywords: ['alt', 'sgpt', 'alanine aminotransferase'],
    unit: 'U/L',
    range: { low: 7, high: 56 },
    about: 'ALT is a liver enzyme and can rise with liver irritation.',
    lowCauses: ['Usually not clinically significant', 'Nutritional factors', 'Lab variation'],
    highCauses: ['Fatty liver', 'Alcohol exposure', 'Medication-related irritation'],
    lowSuggestions: ['Track with future reports', 'Maintain balanced diet', 'Discuss only if other abnormalities exist'],
    highSuggestions: ['Limit alcohol and processed foods', 'Maintain healthy weight', 'Consult doctor for persistent elevation']
  },
  {
    id: 'ast',
    name: 'Liver Enzyme (AST)',
    keywords: ['ast', 'sgot', 'aspartate aminotransferase'],
    unit: 'U/L',
    range: { low: 10, high: 40 },
    about: 'AST can rise in liver, muscle, or metabolic stress.',
    lowCauses: ['Usually not clinically significant', 'Lab variation', 'Low muscle mass'],
    highCauses: ['Liver inflammation', 'Muscle injury', 'Alcohol-related stress'],
    lowSuggestions: ['Monitor trend over time', 'Maintain healthy nutrition', 'Correlate with other enzymes'],
    highSuggestions: ['Avoid alcohol and heavy exertion before retest', 'Review medicines', 'Consult your doctor for persistent rise']
  }
];

function sanitizeStorageSegment(value) {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  return sanitized || 'unknown';
}

function sanitizeFileBaseName(name) {
  const cleaned = String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 60);
  return cleaned || 'report';
}

function inferMedicalReportExtension(originalName, mimeType) {
  const ext = String(path.extname(originalName || '') || '')
    .toLowerCase()
    .trim();
  if (ALLOWED_MEDICAL_REPORT_EXTENSIONS.has(ext)) return ext;
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'image/png') return '.png';
  return '.jpg';
}

function isAllowedMedicalReportFile(file) {
  if (!file) return false;
  const mimeType = String(file.mimetype || '').toLowerCase().trim();
  const ext = String(path.extname(file.originalname || '') || '')
    .toLowerCase()
    .trim();
  return ALLOWED_MEDICAL_REPORT_MIME_TYPES.has(mimeType) || ALLOWED_MEDICAL_REPORT_EXTENSIONS.has(ext);
}

const medicalReportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDICAL_REPORT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMedicalReportFile(file)) {
      cb(new Error('Only PDF, JPG, and PNG files up to 10MB are supported.'));
      return;
    }
    cb(null, true);
  }
});

function safeDeleteFile(absolutePath) {
  try {
    if (!absolutePath) return;
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
  } catch {
    return;
  }
}

function resolveMedicalReportAbsolutePath(storedPath) {
  const raw = String(storedPath || '').trim();
  if (!raw) return '';
  const absolute = path.isAbsolute(raw) ? raw : path.join(MEDICAL_REPORT_UPLOAD_DIR, raw);
  const normalized = path.normalize(absolute);
  const root = path.normalize(MEDICAL_REPORT_UPLOAD_DIR + path.sep);
  if (normalized !== path.normalize(MEDICAL_REPORT_UPLOAD_DIR) && !normalized.startsWith(root)) return '';
  return normalized;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMetricValue(metricId, value, unitRaw) {
  if (!Number.isFinite(value)) return value;
  const unit = String(unitRaw || '').toLowerCase();
  if (metricId === 'wbc' || metricId === 'platelets') {
    if (value > 1000 && !unit.includes('10^3') && !unit.includes('x10')) return value / 1000;
  }
  if (metricId === 'rbc' && value > 100) {
    return value / 1000000;
  }
  if (metricId === 'blood_sugar' && unit.includes('mmol')) {
    return value * 18;
  }
  if (metricId === 'cholesterol' && unit.includes('mmol')) {
    return value * 38.67;
  }
  if (metricId === 'creatinine' && (unit.includes('umol') || unit.includes('µmol'))) {
    return value / 88.4;
  }
  return value;
}

function extractMetricFromText(extractedText, metric) {
  const lines = String(extractedText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const keyword of metric.keywords) {
    const keywordRegex = new RegExp(`${escapeRegex(keyword)}[^\\d+-]{0,28}([-+]?\\d+(?:\\.\\d+)?)\\s*([a-zA-Z%/\\^\\u00B5\\d\\.]+)?`, 'i');
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (!lowerLine.includes(keyword.toLowerCase())) continue;
      const match = line.match(keywordRegex) || line.match(/([-+]?\d+(?:\.\d+)?)/);
      if (!match) continue;
      const parsed = Number(match[1] || match[0]);
      if (!Number.isFinite(parsed)) continue;
      const unit = String(match[2] || metric.unit || '').trim();
      const normalizedValue = normalizeMetricValue(metric.id, parsed, unit);
      return { value: Number(normalizedValue.toFixed(2)), unit: unit || metric.unit, sourceLine: line };
    }
  }
  return null;
}

function classifyMetricStatus(value, range) {
  const low = Number(range?.low ?? 0);
  const high = Number(range?.high ?? 0);
  if (!Number.isFinite(value) || !Number.isFinite(low) || !Number.isFinite(high)) return 'Critical';
  if (value < low) {
    const deviation = (low - value) / Math.max(low, 1);
    return deviation >= 0.25 ? 'Critical' : 'Slightly Low';
  }
  if (value > high) {
    const deviation = (value - high) / Math.max(high, 1);
    return deviation >= 0.25 ? 'Critical' : 'Slightly High';
  }
  return 'Normal';
}

function summarizeStatusCounts(parameters) {
  const base = { total: 0, normal: 0, slightlyLow: 0, slightlyHigh: 0, critical: 0 };
  for (const item of parameters || []) {
    base.total += 1;
    if (item.status === 'Normal') base.normal += 1;
    else if (item.status === 'Slightly Low') base.slightlyLow += 1;
    else if (item.status === 'Slightly High') base.slightlyHigh += 1;
    else base.critical += 1;
  }
  return base;
}

function buildParameterNarrative(metric, value, unit, status) {
  const valueText = `${value} ${unit || metric.unit}`.trim();
  if (status === 'Normal') {
    return `${metric.about} Your ${metric.name} value of ${valueText} is within the expected range.`;
  }
  if (status === 'Slightly Low') {
    return `${metric.about} Your ${metric.name} value of ${valueText} is slightly below the usual range.`;
  }
  if (status === 'Slightly High') {
    return `${metric.about} Your ${metric.name} value of ${valueText} is slightly above the usual range.`;
  }
  return `${metric.about} Your ${metric.name} value of ${valueText} is significantly outside the typical range and should be reviewed quickly with a doctor.`;
}

function buildMedicalSummary(parameters) {
  const counts = summarizeStatusCounts(parameters);
  if (counts.total === 0) {
    return {
      counts,
      highlights: ['No supported lab parameters were detected from this report text.'],
      overallRecommendation:
        'Try uploading a clearer PDF/image or consult your clinician for direct interpretation of this report.',
      healthScore: 0
    };
  }

  const abnormal = (parameters || []).filter((entry) => entry.status !== 'Normal');
  const highlights = abnormal.length
    ? abnormal.slice(0, 6).map((entry) => `${entry.testName}: ${entry.status} (${entry.value} ${entry.unit})`)
    : ['Recognized parameters are within expected range.'];

  let overallRecommendation = 'Maintain your current routine and continue periodic checkups.';
  if (counts.critical > 0) {
    overallRecommendation =
      'One or more values are in a critical range. Please seek professional medical advice promptly.';
  } else if (abnormal.length > 0) {
    overallRecommendation =
      'A few values are mildly outside range. Focus on nutrition, hydration, and follow-up testing with your clinician.';
  }

  const healthScore = counts.total > 0 ? Math.round((counts.normal / counts.total) * 100) : 0;
  return { counts, highlights, overallRecommendation, healthScore };
}

function analyzeMedicalReportText(extractedText) {
  const parameters = [];
  for (const metric of MEDICAL_TEST_CATALOG) {
    const detected = extractMetricFromText(extractedText, metric);
    if (!detected) continue;
    const status = classifyMetricStatus(detected.value, metric.range);
    const possibleCauses =
      status === 'Normal' ? [] : status === 'Slightly Low' ? metric.lowCauses : metric.highCauses;
    const normalizedSuggestions =
      status === 'Slightly Low'
        ? metric.lowSuggestions
        : status === 'Normal'
          ? ['Continue balanced diet, hydration, and routine health monitoring.']
          : metric.highSuggestions;
    if (status === 'Critical') {
      normalizedSuggestions.unshift('Please seek medical consultation promptly for targeted evaluation.');
    }
    parameters.push({
      id: metric.id,
      testName: metric.name,
      value: detected.value,
      unit: detected.unit || metric.unit,
      normalRange: `${metric.range.low} - ${metric.range.high} ${metric.unit}`.trim(),
      status,
      explanation: buildParameterNarrative(metric, detected.value, detected.unit || metric.unit, status),
      possibleCauses,
      suggestions: normalizedSuggestions,
      sourceLine: detected.sourceLine
    });
  }

  const severityOrder = { Critical: 0, 'Slightly High': 1, 'Slightly Low': 2, Normal: 3 };
  parameters.sort((a, b) => Number(severityOrder[a.status] ?? 99) - Number(severityOrder[b.status] ?? 99));
  const summary = buildMedicalSummary(parameters);
  return {
    generatedAt: nowIso(),
    disclaimer: MEDICAL_ANALYSIS_DISCLAIMER,
    parameters,
    summary: {
      highlights: summary.highlights,
      overallRecommendation: summary.overallRecommendation
    },
    counts: summary.counts,
    healthScore: summary.healthScore,
    trustedResources: [
      { label: 'World Health Organization (WHO)', url: 'https://www.who.int' },
      { label: 'CDC Health Topics', url: 'https://www.cdc.gov' },
      { label: 'MedlinePlus Lab Tests', url: 'https://medlineplus.gov/lab-tests/' }
    ]
  };
}

async function extractTextFromMedicalReport(buffer, kind) {
  if (!Buffer.isBuffer(buffer)) throw new Error('Invalid report buffer.');
  if (kind === 'pdf') {
    const parsed = await pdfParse(buffer);
    return String(parsed?.text || '').trim();
  }
  const ocr = await Tesseract.recognize(buffer, 'eng');
  return String(ocr?.data?.text || '').trim();
}

async function createMedicalReportRecord({ userId, filePath, extractedText, analysisResult }) {
  const uploadedAt = nowIso();
  const { data, error } = await supabase
    .from('medical_reports')
    .insert({
      user_id: String(userId || ''),
      file_path: String(filePath || ''),
      extracted_text: String(extractedText || ''),
      analysis_result: analysisResult || {},
      uploaded_at: uploadedAt
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating medical report record:', error);
    throw error;
  }
  return data;
}

async function getMedicalReportsForUser(userId) {
  const { data, error } = await supabase
    .from('medical_reports')
    .select('*')
    .eq('user_id', userId)
    .order('uploaded_at', { ascending: false });

  if (error) {
    console.error('Error fetching medical reports for user:', error);
    return [];
  }
  return data || [];
}

async function getMedicalReportByIdForUser(reportId, userId) {
  const { data, error } = await supabase
    .from('medical_reports')
    .select('*')
    .eq('id', reportId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('Error fetching medical report by ID:', error);
    return null;
  }
  return data;
}

async function deleteMedicalReportByIdForUser(reportId, userId) {
  const { error } = await supabase
    .from('medical_reports')
    .delete()
    .eq('id', reportId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting medical report:', error);
    return { changes: 0 };
  }
  return { changes: 1 };
}

function toMedicalReportResponse(row, includeExtractedText = false) {
  if (!row) return null;
  const analysisResult = row.analysis_result || {};
  const response = {
    id: row.id,
    userId: row.user_id,
    fileName: row.file_path ? path.basename(String(row.file_path)) : 'report',
    uploadedAt: row.uploaded_at,
    analysisResult
  };
  if (includeExtractedText) {
    response.extractedText = String(row.extracted_text || '');
  } else {
    response.extractedTextPreview = String(row.extracted_text || '').slice(0, 500);
  }
  return response;
}

function normalizeUserStateMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof k !== 'string') continue;
    if (!k.startsWith('ayustra_') && !k.startsWith('ayusutra_')) continue;
    if (k === 'ayustra_access_token' || k === 'ayustra_user') continue;
    if (typeof v !== 'string') continue;
    out[k] = v;
  }
  return out;
}

async function getUserState(userId) {
  const { data, error } = await supabase
    .from('user_states')
    .select('state_json, updated_at')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching user state:', error);
  }
  if (!data) return { state: {}, updatedAt: null };
  const parsed = typeof data.state_json === 'string' ? safeJsonParseObject(data.state_json, {}) : data.state_json;
  return { state: normalizeUserStateMap(parsed), updatedAt: data.updated_at || null };
}

async function upsertUserState(userId, state) {
  const normalized = normalizeUserStateMap(state);
  const updatedAt = nowIso();
  
  const { error } = await supabase
    .from('user_states')
    .upsert({
      user_id: userId,
      state_json: normalized,
      updated_at: updatedAt
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error upserting user state:', error);
    throw error;
  }
  return { state: normalized, updatedAt };
}

function safeJsonParseObject(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function safeJsonParseByType(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || 'null'));
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    if (fallback && typeof fallback === 'object') return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function hashGuidanceContext(input) {
  return crypto.createHash('sha256').update(stableStringify(input)).digest('hex');
}

function toLowerCleanList(input, max = 20) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseStateRecordValue(stateMap, key, fallback) {
  if (!stateMap || typeof stateMap !== 'object') return fallback;
  const raw = stateMap[key];
  if (typeof raw !== 'string') return fallback;
  return safeJsonParseByType(raw, fallback);
}

function formatSeasonFromMonth(monthZeroBased) {
  const month = Number(monthZeroBased || 0) + 1;
  if (month === 12 || month <= 2) return 'Shishira';
  if (month <= 4) return 'Vasanta';
  if (month <= 6) return 'Grishma';
  if (month <= 8) return 'Varsha';
  if (month <= 10) return 'Sharada';
  return 'Hemanta';
}

function inferClimateZoneFromLocation(locationText) {
  const value = String(locationText || '').trim().toLowerCase();
  if (!value) return 'unknown';
  const humidTokens = ['kerala', 'goa', 'mumbai', 'kolkata', 'chennai', 'bengal', 'assam', 'florida', 'singapore'];
  const aridTokens = ['rajasthan', 'dubai', 'abu dhabi', 'phoenix', 'nevada', 'arizona', 'jodhpur'];
  const coldTokens = ['himachal', 'kashmir', 'ladakh', 'sikkim', 'alaska', 'canada', 'norway', 'sweden'];
  const coastalTokens = ['coast', 'coastal', 'beach', 'port', 'bay', 'seaside'];
  const tropicalTokens = ['tropical', 'equator', 'sri lanka', 'indonesia', 'malaysia', 'thailand'];

  if (aridTokens.some((token) => value.includes(token))) return 'arid';
  if (coldTokens.some((token) => value.includes(token))) return 'cold';
  if (humidTokens.some((token) => value.includes(token))) return 'humid';
  if (coastalTokens.some((token) => value.includes(token))) return 'coastal';
  if (tropicalTokens.some((token) => value.includes(token))) return 'tropical';
  return 'temperate';
}

function resolveSeasonalContext(now, locationText) {
  const climateZone = inferClimateZoneFromLocation(locationText);
  const season = formatSeasonFromMonth(now.getUTCMonth());
  let climateNote = 'General seasonal adjustment.';
  if (climateZone === 'humid' || climateZone === 'coastal') climateNote = 'Humid climate: favor lighter warm meals and reduce heaviness.';
  if (climateZone === 'arid' || climateZone === 'cold') climateNote = 'Dry/cold climate: prioritize warm hydration and unctuous support.';
  if (climateZone === 'tropical') climateNote = 'Tropical climate: emphasize cooling hydration and heat-aware routines.';
  return { season, climateZone, climateNote };
}

function formatTimeWindow(hour) {
  if (hour < 10) return 'morning';
  if (hour < 16) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function normalizeSymptomSeverity(input) {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';
  return 'Medium';
}

function sanitizeSymptomText(input, maxLen = 80) {
  const value = String(input || '').replace(/\s+/g, ' ').trim();
  return value.slice(0, maxLen);
}

function sanitizeTimelineText(input, maxLen = 220) {
  return String(input || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeDateOnly(input) {
  const value = String(input || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = new Date(`${value}T00:00:00.000Z`).getTime();
  return Number.isFinite(stamp) ? value : null;
}

async function listRecentSymptomLogs(userId, days = 10, limit = 40) {
  const safeDays = Math.max(1, Math.min(60, Number(days || 10)));
  const safeLimit = Math.max(1, Math.min(120, Number(limit || 40)));
  const sinceDate = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const { data, error } = await supabase
    .from('daily_symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_for_date', sinceDate)
    .order('logged_for_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error listing symptom logs:', error);
    return [];
  }

  return data.map((row) => ({
    id: String(row.id || ''),
    symptom: sanitizeSymptomText(row.symptom, 80),
    severity: normalizeSymptomSeverity(row.severity),
    note: sanitizeSymptomText(row.note, 220),
    loggedForDate: String(row.logged_for_date || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || '')
  }));
}

async function upsertDailySymptomLog(userId, payload = {}) {
  const patientId = String(userId || '').trim();
  const symptom = sanitizeSymptomText(payload.symptom, 80);
  const severity = normalizeSymptomSeverity(payload.severity);
  const note = sanitizeSymptomText(payload.note, 220);
  const loggedForDate = normalizeDateOnly(payload.loggedForDate) || nowIso().slice(0, 10);
  if (!patientId) throw new Error('invalid_user');
  if (symptom.length < 2) throw new Error('invalid_symptom');
  const now = nowIso();

  const { data, error } = await supabase
    .from('daily_symptom_logs')
    .upsert({
      user_id: patientId,
      symptom: symptom,
      severity: severity,
      note: note,
      logged_for_date: loggedForDate,
      updated_at: now
    }, { onConflict: 'user_id,logged_for_date,symptom' })
    .select('*')
    .single();

  if (error) {
    console.error('Error upserting symptom log:', error);
    throw error;
  }

  return {
    id: data.id,
    symptom: data.symptom,
    severity: data.severity,
    note: data.note,
    loggedForDate: data.logged_for_date,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

async function logHealthTimelineEvent(userId, payload = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const title = sanitizeTimelineText(payload.title, 120);
  if (!title) return null;
  const details = sanitizeTimelineText(payload.details, 260);
  const eventType = sanitizeTimelineText(payload.eventType || 'health_event', 48) || 'health_event';
  const occurredAtRaw = String(payload.occurredAt || '').trim();
  const occurredAt = Number.isFinite(new Date(occurredAtRaw).getTime()) ? occurredAtRaw : nowIso();
  const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? payload.metadata
    : {};
  const now = nowIso();

  const { data, error } = await supabase
    .from('health_timeline_events')
    .insert([{
      user_id: uid,
      event_type: eventType,
      title,
      details,
      metadata_json: metadata,
      occurred_at: occurredAt,
      created_at: now
    }])
    .select('*')
    .single();

  if (error) {
    console.error('Error logging timeline event:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    eventType: data.event_type,
    title: data.title,
    details: data.details,
    metadata: typeof data.metadata_json === 'string' ? safeJsonParseObject(data.metadata_json, {}) : data.metadata_json || {},
    occurredAt: data.occurred_at,
    createdAt: data.created_at
  };
}

async function listHealthTimelineEvents(userId, limit = 60) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 60)));
  
  const { data, error } = await supabase
    .from('health_timeline_events')
    .select('*')
    .eq('user_id', uid)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error listing health timeline events:', error);
    return [];
  }

  return data.map((row) => ({
    id: String(row.id || ''),
    userId: String(row.user_id || ''),
    eventType: String(row.event_type || 'health_event'),
    title: sanitizeTimelineText(row.title, 120),
    details: sanitizeTimelineText(row.details, 260),
    metadata: typeof row.metadata_json === 'string' ? safeJsonParseObject(row.metadata_json, {}) : row.metadata_json || {},
    occurredAt: String(row.occurred_at || ''),
    createdAt: String(row.created_at || '')
  }));
}

function detectUrgentSymptom(symptomText) {
  const bag = String(symptomText || '').toLowerCase();
  if (!bag) return false;
  const emergencySignals = [
    'chest pain',
    'severe pain',
    'shortness of breath',
    'difficulty breathing',
    'fainting',
    'blood in vomit',
    'blood stool',
    'suicidal'
  ];
  return emergencySignals.some((token) => bag.includes(token));
}

function sentence(input, maxLen = 170) {
  const compact = String(input || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 1).trimEnd()}.`;
}

function parsePatientContextFromState(userId, stateMap) {
  const patients = parseStateRecordValue(stateMap, 'ayustra_patients', []);
  const patient = Array.isArray(patients) ? patients.find((p) => String(p?.id || '') === String(userId || '')) || null : null;
  const consultations = parseStateRecordValue(stateMap, 'ayusutra_consultations_v2', []);
  const prescriptions = parseStateRecordValue(stateMap, 'ayusutra_prescriptions_v2', []);
  const diets = parseStateRecordValue(stateMap, 'ayusutra_diets_v2', []);
  const routines = parseStateRecordValue(stateMap, `ayusutra_routine_reminders_${userId}`, null);
  return { patient, consultations, prescriptions, diets, routines };
}

async function getGuidanceFeedbackStats(userId, days = 28) {
  const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  
  // Custom query approach for Supabase/PostgreSQL
  const { data, error } = await supabase
    .from('guidance_feedback')
    .select(`
      feedback_type,
      guidance_items ( rule_key )
    `)
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    console.error('Error getting guidance feedback stats:', error);
    return { helpful: 0, ignored: 0, ignoredRules: new Set(), helpfulRules: new Set() };
  }

  const ignoredRules = new Set();
  const helpfulRules = new Set();
  let helpful = 0;
  let ignored = 0;

  // Process manual aggregation
  const aggregation = {};

  data.forEach(row => {
    const feedbackType = row.feedback_type;
    const ruleKey = row.guidance_items?.rule_key;
    if (!ruleKey) return;

    const aggKey = `${feedbackType}:${ruleKey}`;
    aggregation[aggKey] = (aggregation[aggKey] || 0) + 1;
  });

  Object.entries(aggregation).forEach(([key, count]) => {
    const [feedbackType, ruleKey] = key.split(':');
    if (feedbackType === 'ignored' || feedbackType === 'dismissed') {
      ignored += count;
      if (count >= 2) ignoredRules.add(ruleKey);
    }
    if (feedbackType === 'helpful' || feedbackType === 'saved') {
      helpful += count;
      if (count >= 1) helpfulRules.add(ruleKey);
    }
  });

  return { helpful, ignored, ignoredRules, helpfulRules };
}

async function buildGuidanceContext(userId) {
  const user = await getUserById(userId);
  const role = normalizeRole(user?.role);
  const userState = await getUserState(userId);
  const { patient, consultations, prescriptions } = parsePatientContextFromState(userId, userState.state);

  const persistentAssessments = await listDoshaAssessmentsForUser(userId, 12);
  const fallbackAssessments = Array.isArray(patient?.doshaAssessments)
    ? [...patient.doshaAssessments].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
    : [];
  const assessments = persistentAssessments.length ? persistentAssessments : fallbackAssessments;
  const latestAssessment = assessments[0] || null;
  const symptomsFromAssessment = toLowerCleanList((latestAssessment?.vikriti?.symptoms || []).map((item) => item?.label || item?.key || ''), 8);

  const { data: recentBookings, error: bookingsError } = await supabase
    .from('consultation_bookings')
    .select('mode, status, issue_context, scheduled_time, duration_minutes, updated_at')
    .eq('patient_id', userId)
    .order('scheduled_time', { ascending: false })
    .limit(24);

  if (bookingsError) console.error('Error fetching bookings for guidance:', bookingsError);

  const recentIssueTexts = (recentBookings || [])
    .map((item) => String(item.issue_context || '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const localConsultSummaries = Array.isArray(consultations)
    ? consultations
        .filter((item) => String(item?.patientId || '') === String(userId || ''))
        .map((item) => String(item?.summary || '').trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const medsFromProfile = Array.isArray(patient?.currentMedications)
    ? patient.currentMedications.map((item) => String(item?.name || '').trim()).filter(Boolean)
    : [];
  const medsFromPrescription = Array.isArray(prescriptions)
    ? prescriptions
        .filter((item) => String(item?.patientId || '') === String(userId || ''))
        .flatMap((item) => Array.isArray(item?.items) ? item.items.map((rx) => String(rx?.medicine || rx?.name || '').trim()) : [])
        .filter(Boolean)
    : [];

  const allergies = toLowerCleanList(patient?.allergies || patient?.healthData?.allergies || [], 12);
  const recentSymptomLogs = await listRecentSymptomLogs(userId, 10, 30);
  const symptomsFromDailyLogs = recentSymptomLogs
    .map((item) => {
      const symptom = sanitizeSymptomText(item?.symptom || '', 80);
      const severity = normalizeSymptomSeverity(item?.severity || 'Medium');
      if (!symptom) return '';
      return severity === 'High' ? `${symptom} (high)` : symptom;
    })
    .filter(Boolean)
    .slice(0, 10);
  const now = new Date();
  const timeWindow = formatTimeWindow(now.getUTCHours());
  const missedConsultations = (recentBookings || []).filter((item) => String(item.status || '') === 'cancelled').length;
  const upcomingConsultation = (recentBookings || []).find((item) => String(item.status || '') === 'scheduled' && new Date(String(item.scheduled_time || '')).getTime() > Date.now()) || null;
  const postConsultPending = (recentBookings || []).find((item) => String(item.status || '') === 'completed') || null;
  const profileAge = Number(patient?.age || patient?.profile?.age || 0) || null;
  const location = String(patient?.location || patient?.profile?.location || '').trim();
  const gender = String(patient?.gender || patient?.profile?.gender || '').trim();
  const usageLagHours = userState.updatedAt ? Math.round((Date.now() - new Date(userState.updatedAt).getTime()) / (60 * 60 * 1000)) : 999;
  const seasonalContext = resolveSeasonalContext(now, location);

  const feedbackStats = await getGuidanceFeedbackStats(userId);
  const severeSymptom =
    [...symptomsFromDailyLogs, ...symptomsFromAssessment, ...recentIssueTexts].some((entry) => detectUrgentSymptom(entry))
    || recentSymptomLogs.some((item) => normalizeSymptomSeverity(item.severity) === 'High');
  const primaryDosha = String(latestAssessment?.prakriti?.primary || latestAssessment?.primaryDosha || 'Vata');
  const secondaryDosha = String(latestAssessment?.prakriti?.secondary || latestAssessment?.secondaryDosha || '').trim();
  const dominantImbalance = String(latestAssessment?.vikriti?.dominant || 'Balanced');

  return {
    user: {
      id: user?.id || userId,
      role,
      name: String(user?.name || '').trim(),
      age: profileAge,
      gender,
      location
    },
    ayurvedic: {
      primaryDosha,
      secondaryDosha: secondaryDosha || null,
      dominantImbalance,
      imbalanceSeverity: String(latestAssessment?.vikriti?.severity || 'Balanced'),
      lastAssessmentDate: String(latestAssessment?.submittedAt || ''),
      imbalanceHistoryCount: assessments.length
    },
    health: {
      symptoms: [...symptomsFromDailyLogs, ...symptomsFromAssessment, ...recentIssueTexts].slice(0, 10),
      recentDailySymptoms: recentSymptomLogs.slice(0, 8),
      consultations: recentBookings || [],
      localConsultSummaries,
      prescribedMedicines: [...new Set([...medsFromProfile, ...medsFromPrescription])].slice(0, 12),
      allergies,
      severeSymptom
    },
    behavioral: {
      usageLagHours,
      usageBand: usageLagHours <= 24 ? 'daily' : usageLagHours <= 72 ? 'weekly' : 'low',
      missedConsultations,
      adherenceBand: feedbackStats.helpful >= feedbackStats.ignored ? 'good' : 'needs_support',
      helpfulFeedbackCount: feedbackStats.helpful,
      ignoredFeedbackCount: feedbackStats.ignored,
      ignoredRules: feedbackStats.ignoredRules,
      helpfulRules: feedbackStats.helpfulRules
    },
    seasonal: {
      season: seasonalContext.season,
      climateZone: seasonalContext.climateZone,
      climateNote: seasonalContext.climateNote,
      timeWindow,
      generatedAt: now.toISOString()
    },
    careState: {
      upcomingConsultationAt: upcomingConsultation ? String(upcomingConsultation.scheduled_time || '') : '',
      postConsultationAt: postConsultPending ? String(postConsultPending.updated_at || postConsultPending.scheduled_time || '') : ''
    }
  };
}

function buildGuidanceProfilePayload(context) {
  return {
    doshaProfile: {
      primary: context.ayurvedic.primaryDosha,
      secondary: context.ayurvedic.secondaryDosha,
      dominantImbalance: context.ayurvedic.dominantImbalance,
      lastAssessmentDate: context.ayurvedic.lastAssessmentDate,
      imbalanceHistoryCount: context.ayurvedic.imbalanceHistoryCount
    },
    healthData: {
      activeSymptoms: context.health.symptoms.slice(0, 8),
      prescribedMedicines: context.health.prescribedMedicines.slice(0, 8),
      allergies: context.health.allergies.slice(0, 8),
      recentConsultations: context.health.consultations.slice(0, 5).map((item) => ({
        status: item.status,
        mode: item.mode,
        scheduledTime: item.scheduledTime
      }))
    },
    preferences: {
      preferredTone: context.behavioral.adherenceBand === 'good' ? 'direct' : 'supportive',
      ignoredRules: [...context.behavioral.ignoredRules].slice(0, 12),
      helpfulRules: [...context.behavioral.helpfulRules].slice(0, 12)
    }
  };
}

async function upsertUserGuidanceProfile(userId, profilePayload) {
  const now = nowIso();
  const { data, error } = await supabase
    .from('user_guidance_profiles')
    .upsert({
      user_id: String(userId || ''),
      dosha_profile: profilePayload.doshaProfile || {},
      health_data: profilePayload.healthData || {},
      preferences: profilePayload.preferences || {},
      updated_at: now
    }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (error) {
    console.error('Error upserting guidance profile:', error);
    return null;
  }
  return data.id;
}

async function getRecentGuidanceByRule(userId, days = 10) {
  const since = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('guidance_items')
    .select('rule_key')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    console.error('Error getting recent guidance by rule:', error);
    return new Map();
  }

  const counts = new Map();
  for (const row of (data || [])) {
    const key = String(row.rule_key || '');
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function personalizeGuidanceText(baseText, context, ruleKey) {
  const tones = [
    sentence(baseText),
    sentence(`${baseText} Keep it gentle and consistent today.`),
    sentence(`${baseText} Start small and stay regular this week.`)
  ];
  const seed = hashGuidanceContext({ userId: context.user.id, ruleKey, day: context.seasonal.generatedAt.slice(0, 10) });
  const idx = Number.parseInt(seed.slice(0, 2), 16) % tones.length;
  return tones[idx];
}

function buildGuidanceCandidates(context) {
  const list = [];
  const primary = context.ayurvedic.primaryDosha || 'Vata';
  const imbalance = context.ayurvedic.dominantImbalance || 'Balanced';
  const season = context.seasonal.season;
  const climateZone = String(context.seasonal.climateZone || 'unknown');
  const timeWindow = context.seasonal.timeWindow;
  const symptoms = context.health.symptoms || [];
  const hasSymptoms = symptoms.length > 0;
  const withDosha = primary === 'Pitta' ? 'cooling meals and reduced spicy foods' : primary === 'Kapha' ? 'lighter meals and brisk movement' : 'warm meals and stable meal timing';
  const hydrationLine =
    primary === 'Vata'
      ? 'Sip warm water before breakfast to reduce dryness and bloating.'
      : primary === 'Pitta'
      ? 'Drink room-temperature water through the day to cool excess heat.'
      : 'Take warm ginger-infused water between meals to reduce heaviness.';
  const climateLine =
    climateZone === 'humid' || climateZone === 'coastal'
      ? 'Because your local climate is humid, keep dinner lighter and avoid heavy dairy at night.'
      : climateZone === 'arid' || climateZone === 'cold'
      ? 'Because your local climate is dry/cold, add warm fluids and gentle oiling to reduce dryness.'
      : climateZone === 'tropical'
      ? 'Because your local climate is tropical, avoid peak-heat exertion and favor cooling hydration.'
      : '';

  list.push({
    type: 'daily',
    ruleKey: `daily_${primary.toLowerCase()}_${timeWindow}`,
    priority: 40,
    triggerReason: `Based on your ${primary} profile and ${timeWindow} routine`,
    whySuggested: `Aligned with your ${primary} tendency and current ${season} season.`,
    followWindow: 'Today',
    content: personalizeGuidanceText(hydrationLine, context, `daily_${primary.toLowerCase()}_${timeWindow}`)
  });
  if (climateLine) {
    list.push({
      type: 'daily',
      ruleKey: `daily_climate_${climateZone}_${timeWindow}`,
      priority: 55,
      triggerReason: `Adjusted for your ${climateZone} climate`,
      whySuggested: `Uses your profile location and current season.`,
      followWindow: 'Today',
      content: personalizeGuidanceText(climateLine, context, `daily_climate_${climateZone}_${timeWindow}`)
    });
  }

  if (hasSymptoms) {
    const symptom = String(symptoms[0] || 'your current symptoms').toLowerCase();
    list.push({
      type: 'condition',
      ruleKey: `condition_${imbalance.toLowerCase()}`,
      priority: 90,
      triggerReason: `Triggered by active symptom: ${symptom}`,
      whySuggested: `Focused support for your reported symptom pattern this week.`,
      followWindow: 'Next 24 hours',
      content: personalizeGuidanceText(
        `Since your ${imbalance} pattern is active, keep meals simple today and avoid late-night eating to ease ${symptom}.`,
        context,
        `condition_${imbalance.toLowerCase()}`
      )
    });
  }

  if (imbalance !== 'Balanced') {
    list.push({
      type: 'dosha_balancing',
      ruleKey: `dosha_balance_${imbalance.toLowerCase()}_${season.toLowerCase()}`,
      priority: 75,
      triggerReason: `Your recent dosha assessment shows ${imbalance} imbalance`,
      whySuggested: `Uses your latest dosha report and seasonal context.`,
      followWindow: 'This week',
      content: personalizeGuidanceText(
        `Your ${imbalance} is elevated, so follow ${withDosha} for better balance this week.`,
        context,
        `dosha_balance_${imbalance.toLowerCase()}_${season.toLowerCase()}`
      )
    });
  }

  if (context.careState.postConsultationAt) {
    list.push({
      type: 'post_consultation',
      ruleKey: 'post_consult_followup',
      priority: 85,
      triggerReason: 'You have a recent consultation record',
      whySuggested: 'Reinforces doctor-advised continuity and medicine schedule.',
      followWindow: 'Today',
      content: personalizeGuidanceText(
        'After your recent consultation, follow medicine timings exactly today and note any side effects before your next check-in.',
        context,
        'post_consult_followup'
      )
    });
  }

  list.push({
    type: 'preventive',
    ruleKey: `preventive_${season.toLowerCase()}_${timeWindow}`,
    priority: 35,
    triggerReason: `Seasonal prevention for ${season}`,
    whySuggested: `Prevents seasonal aggravation for your ${primary} profile.`,
    followWindow: 'This week',
      content: personalizeGuidanceText(
        `During ${season}, keep a consistent sleep window and light evening meals to prevent dosha flare-ups. ${String(
          context.seasonal.climateNote || ''
        )}`.trim(),
        context,
        `preventive_${season.toLowerCase()}_${timeWindow}`
      )
  });

  if (context.health.severeSymptom) {
    list.unshift({
      type: 'safety',
      ruleKey: 'safety_escalation',
      priority: 100,
      triggerReason: 'Potential severe symptom detected',
      whySuggested: 'Safety rule triggered for urgent symptom pattern.',
      followWindow: 'Now',
      content: sentence(
        'These symptoms may need urgent medical care. Use emergency services immediately and contact your doctor; this guidance is supportive, not diagnostic.'
      )
    });
  }

  return list;
}

async function filterGuidanceCandidates(userId, candidates, context) {
  const ruleCounts = await getRecentGuidanceByRule(userId, 10);
  const ignoredRules = context.behavioral.ignoredRules || new Set();
  const filtered = candidates.filter((item) => {
    const seenCount = Number(ruleCounts.get(item.ruleKey) || 0);
    if (ignoredRules.has(item.ruleKey)) return false;
    if (seenCount >= 3 && item.type !== 'safety') return false;
    return true;
  });
  return filtered.length ? filtered : candidates.slice(0, 3);
}

function mapGuidanceRow(row) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    content: row.content,
    triggerReason: row.triggerReason,
    whySuggested: row.whySuggested || '',
    whenToFollow: row.followWindow || 'Today',
    priority: Number(row.priority || 50),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    isSaved: Number(row.isSaved || 0) === 1,
    isDismissed: Number(row.isDismissed || 0) === 1
  };
}

async function getCachedGuidance(userId, contextHash, dateOnly) {
  const startIso = `${dateOnly}T00:00:00.000Z`;
  
  const { data, error } = await supabase
    .from('guidance_items')
    .select('*')
    .eq('user_id', userId)
    .eq('context_hash', contextHash)
    .gte('created_at', startIso)
    .gt('expires_at', nowIso())
    .eq('is_dismissed', false)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching cached guidance:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    content: row.content,
    triggerReason: row.trigger_reason,
    whySuggested: row.why_suggested || '',
    whenToFollow: row.follow_window || 'Today',
    priority: Number(row.priority || 50),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isSaved: !!row.is_saved,
    isDismissed: !!row.is_dismissed
  }));
}

async function createGuidanceForUser(userId, forceRefresh = false) {
  const context = await buildGuidanceContext(userId);
  const contextHash = hashGuidanceContext({
    user: {
      id: context.user.id,
      age: context.user.age || null,
      gender: context.user.gender || '',
      location: context.user.location || ''
    },
    ayurvedic: context.ayurvedic,
    symptoms: context.health.symptoms.slice(0, 6),
    meds: context.health.prescribedMedicines.slice(0, 6),
    behavior: {
      usageBand: context.behavioral.usageBand,
      missedConsultations: context.behavioral.missedConsultations,
      adherenceBand: context.behavioral.adherenceBand
    },
    seasonal: {
      season: context.seasonal.season,
      climateZone: context.seasonal.climateZone || 'unknown',
      timeWindow: context.seasonal.timeWindow,
      day: String(context.seasonal.generatedAt || '').slice(0, 10)
    },
    careState: context.careState
  });
  const dateOnly = String(context.seasonal.generatedAt || nowIso()).slice(0, 10);

  if (!forceRefresh) {
    const cached = await getCachedGuidance(userId, contextHash, dateOnly);
    if (cached.length) {
      return { fromCache: true, contextHash, generatedAt: nowIso(), items: cached };
    }
  }

  const profilePayload = buildGuidanceProfilePayload(context);
  const candidates = await filterGuidanceCandidates(userId, buildGuidanceCandidates(context), context);
  candidates.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  const selectedCandidates = candidates.slice(0, 5);

  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const generatedAt = nowIso();

  await upsertUserGuidanceProfile(userId, profilePayload);
  
  const insertPayload = selectedCandidates.map(candidate => ({
    user_id: String(userId || ''),
    type: candidate.type,
    content: sentence(candidate.content, 220),
    trigger_reason: sentence(candidate.triggerReason, 140),
    why_suggested: sentence(candidate.whySuggested, 140),
    follow_window: sentence(candidate.followWindow, 24),
    priority: Number(candidate.priority || 50),
    rule_key: String(candidate.ruleKey || ''),
    context_hash: contextHash,
    created_at: generatedAt,
    expires_at: expiry,
    is_saved: false,
    is_dismissed: false
  }));

  const { data, error } = await supabase
    .from('guidance_items')
    .insert(insertPayload)
    .select('*');

  if (error) {
    console.error('Error creating guidance items:', error);
    return { fromCache: false, contextHash, generatedAt, items: [] };
  }

  const items = (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    content: row.content,
    triggerReason: row.trigger_reason,
    whySuggested: row.why_suggested || '',
    whenToFollow: row.follow_window || 'Today',
    priority: Number(row.priority || 50),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    isSaved: !!row.is_saved,
    isDismissed: !!row.is_dismissed
  }));

  return { fromCache: false, contextHash, generatedAt, items };
}

async function setGuidanceFeedback(userId, guidanceId, feedbackType) {
  const { data: row, error: fetchError } = await supabase
    .from('guidance_items')
    .select('id, user_id')
    .eq('id', guidanceId)
    .single();

  if (fetchError || !row) throw new Error('guidance_not_found');
  if (String(row.user_id || '') !== String(userId || '')) throw new Error('guidance_forbidden');
  
  const now = nowIso();

  const { error: insertError } = await supabase
    .from('guidance_feedback')
    .insert([{
      guidance_id: guidanceId,
      user_id: userId,
      feedback_type: feedbackType,
      created_at: now
    }]);

  if (insertError) {
    console.error('Error inserting guidance feedback:', insertError);
    throw insertError;
  }

  if (feedbackType === 'saved') {
    await supabase.from('guidance_items').update({ is_saved: true }).eq('id', guidanceId);
  }
  if (feedbackType === 'dismissed') {
    await supabase.from('guidance_items').update({ is_dismissed: true }).eq('id', guidanceId);
  }
}

async function cleanupExpiredGuidance() {
  const now = nowIso();
  const guidanceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const feedbackCutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const symptomCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const timelineCutoff = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
  
  await Promise.all([
    supabase.from('guidance_items').delete().lt('expires_at', guidanceCutoff),
    supabase.from('guidance_feedback').delete().lt('created_at', feedbackCutoff),
    supabase.from('guidance_items').update({ is_dismissed: true }).lt('expires_at', now).eq('is_dismissed', false),
    supabase.from('daily_symptom_logs').delete().lt('logged_for_date', symptomCutoff),
    supabase.from('health_timeline_events').delete().lt('occurred_at', timelineCutoff)
  ]);
}

function nowIso() {
  return new Date().toISOString();
}

function buildSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeRole(role) {
  return role === 'doctor' ? 'doctor' : role === 'patient' ? 'patient' : '';
}

function normalizeConsultationMode(mode) {
  return mode === 'audio' || mode === 'video' ? mode : 'chat';
}

const DOSHA_REASSESS_COOLDOWN_DAYS = 30;
const DOSHA_QUESTION_SECTIONS = [
  {
    id: 'physical_traits',
    title: 'Physical Traits',
    purpose: 'Baseline constitution markers',
    questions: [
      {
        key: 'body_frame',
        prompt: 'How would you describe your natural body frame?',
        track: 'prakriti',
        weight: 1.3,
        options: [
          { key: 'lean_light', label: 'Lean, light, changes easily', map: { Vata: 1 } },
          { key: 'medium_athletic', label: 'Medium, warm, athletic', map: { Pitta: 1 } },
          { key: 'broad_stable', label: 'Broad, sturdy, gains weight easily', map: { Kapha: 1 } },
          { key: 'mixed_frame', label: 'Balanced between medium and broad', map: { Pitta: 0.5, Kapha: 0.5 } }
        ]
      },
      {
        key: 'skin_type',
        prompt: 'Your skin most often feels:',
        track: 'prakriti',
        weight: 1.2,
        options: [
          { key: 'dry_rough', label: 'Dry or rough', map: { Vata: 1 } },
          { key: 'warm_sensitive', label: 'Warm, sensitive, or reddish', map: { Pitta: 1 } },
          { key: 'cool_soft', label: 'Cool, smooth, slightly oily', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'hair_type',
        prompt: 'Your natural hair pattern is closest to:',
        track: 'prakriti',
        weight: 1.1,
        options: [
          { key: 'dry_frizzy', label: 'Dry, frizzy, or thin', map: { Vata: 1 } },
          { key: 'fine_soft', label: 'Fine, soft, may grey early', map: { Pitta: 1 } },
          { key: 'thick_dense', label: 'Thick, dense, and smooth', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'appetite_pattern',
        prompt: 'Over long periods, your appetite is usually:',
        track: 'prakriti',
        weight: 1.3,
        options: [
          { key: 'irregular', label: 'Irregular and variable', map: { Vata: 1 } },
          { key: 'strong_frequent', label: 'Strong and frequent', map: { Pitta: 1 } },
          { key: 'steady_light', label: 'Steady but moderate', map: { Kapha: 1 } }
        ]
      }
    ]
  },
  {
    id: 'physiological_patterns',
    title: 'Physiological Patterns',
    purpose: 'Body function trends',
    questions: [
      {
        key: 'digestion_pattern',
        prompt: 'Most days your digestion feels:',
        track: 'prakriti',
        weight: 1.2,
        options: [
          { key: 'variable_gas', label: 'Variable with gas/bloating', map: { Vata: 1 } },
          { key: 'sharp_hot', label: 'Quick and heat-prone', map: { Pitta: 1 } },
          { key: 'slow_heavy', label: 'Slow and heavy after meals', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'sleep_quality',
        prompt: 'Your sleep quality is often:',
        track: 'prakriti',
        weight: 1.1,
        options: [
          { key: 'light_broken', label: 'Light and interrupted', map: { Vata: 1 } },
          { key: 'moderate', label: 'Moderate and refreshing', map: { Pitta: 1 } },
          { key: 'deep_long', label: 'Deep and prolonged', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'energy_level',
        prompt: 'Your daily energy pattern is:',
        track: 'prakriti',
        weight: 1.1,
        options: [
          { key: 'burst_drop', label: 'Fast bursts then drop', map: { Vata: 1 } },
          { key: 'intense_steady', label: 'Strong and goal-driven', map: { Pitta: 1 } },
          { key: 'slow_stable', label: 'Slow start but stable', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'temperature_tolerance',
        prompt: 'You feel most uncomfortable in:',
        track: 'prakriti',
        weight: 1,
        options: [
          { key: 'cold_windy', label: 'Cold or windy weather', map: { Vata: 1 } },
          { key: 'hot_humid', label: 'Hot or humid weather', map: { Pitta: 1 } },
          { key: 'cold_damp', label: 'Cold damp weather with sluggishness', map: { Kapha: 1 } }
        ]
      }
    ]
  },
  {
    id: 'mental_emotional',
    title: 'Mental & Emotional Traits',
    purpose: 'Mind and response patterns',
    questions: [
      {
        key: 'stress_response',
        prompt: 'During stress, you mostly notice:',
        track: 'prakriti',
        weight: 1.2,
        options: [
          { key: 'worry', label: 'Worry or overthinking', map: { Vata: 1 } },
          { key: 'irritability', label: 'Irritability or impatience', map: { Pitta: 1 } },
          { key: 'withdrawal', label: 'Withdrawal or low motivation', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'decision_style',
        prompt: 'Your natural decision style is:',
        track: 'prakriti',
        weight: 1,
        options: [
          { key: 'quick_change', label: 'Quick but may change mind', map: { Vata: 1 } },
          { key: 'sharp_direct', label: 'Clear and direct', map: { Pitta: 1 } },
          { key: 'slow_consistent', label: 'Deliberate and consistent', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'memory_pattern',
        prompt: 'Your memory pattern is closest to:',
        track: 'prakriti',
        weight: 1,
        options: [
          { key: 'fast_forget', label: 'Quick grasp, quick forget', map: { Vata: 1 } },
          { key: 'sharp_recall', label: 'Sharp and detail-focused', map: { Pitta: 1 } },
          { key: 'slow_strong', label: 'Slow to learn, strong long-term memory', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'emotional_tendency',
        prompt: 'Your emotional tendency is usually:',
        track: 'prakriti',
        weight: 1,
        options: [
          { key: 'sensitive_variable', label: 'Sensitive and variable', map: { Vata: 1 } },
          { key: 'intense', label: 'Intense and goal-oriented', map: { Pitta: 1 } },
          { key: 'calm_attached', label: 'Calm but attached to comfort', map: { Kapha: 1 } }
        ]
      }
    ]
  },
  {
    id: 'lifestyle_habits',
    title: 'Lifestyle & Habits',
    purpose: 'Routine and behavior reinforcement',
    questions: [
      {
        key: 'daily_routine',
        prompt: 'Your routine is generally:',
        track: 'prakriti',
        weight: 0.9,
        options: [
          { key: 'irregular', label: 'Irregular with changing schedules', map: { Vata: 1 } },
          { key: 'structured', label: 'Structured and productive', map: { Pitta: 1 } },
          { key: 'predictable', label: 'Predictable and comfort-focused', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'food_preference',
        prompt: 'You naturally prefer food that is:',
        track: 'prakriti',
        weight: 0.9,
        options: [
          { key: 'warm_soft', label: 'Warm and soft', map: { Vata: 1 } },
          { key: 'cool_fresh', label: 'Cool and fresh', map: { Pitta: 1 } },
          { key: 'light_spicy', label: 'Light and spicy', map: { Kapha: 1 } }
        ]
      },
      {
        key: 'activity_level',
        prompt: 'Your physical activity pattern is:',
        track: 'prakriti',
        weight: 0.9,
        options: [
          { key: 'variable', label: 'Variable and inconsistent', map: { Vata: 1 } },
          { key: 'competitive', label: 'Regular and performance-focused', map: { Pitta: 1 } },
          { key: 'steady_low', label: 'Steady but low intensity', map: { Kapha: 1 } }
        ]
      }
    ]
  }
];

const DOSHA_SYMPTOM_OPTIONS = [
  { key: 'digestive_discomfort', label: 'Digestive discomfort', map: { Vata: 1 } },
  { key: 'fatigue', label: 'Fatigue or low vitality', map: { Kapha: 0.7, Vata: 0.3 } },
  { key: 'acidity', label: 'Acidity or heat sensation', map: { Pitta: 1 } },
  { key: 'anxiety', label: 'Anxiety or restlessness', map: { Vata: 1 } },
  { key: 'seasonal_congestion', label: 'Seasonal congestion or heaviness', map: { Kapha: 1 } },
  { key: 'insomnia', label: 'Sleep disturbance', map: { Vata: 0.8, Pitta: 0.2 } },
  { key: 'irritability', label: 'Irritability', map: { Pitta: 1 } }
];

function getDoshaQuestionMap() {
  const map = new Map();
  DOSHA_QUESTION_SECTIONS.forEach((section) => {
    (section.questions || []).forEach((question) => {
      map.set(question.key, question);
    });
  });
  return map;
}

function calculateDoshaConfidence(totalQuestions, answeredQuestions, symptomCount) {
  const completionScore = totalQuestions > 0 ? answeredQuestions / totalQuestions : 0;
  const symptomBonus = Math.min(0.15, symptomCount * 0.03);
  return Math.max(0, Math.min(100, Math.round((completionScore + symptomBonus) * 100)));
}

function normalizeDoshaPercentages(rawScores) {
  const vata = Number(rawScores?.Vata || 0);
  const pitta = Number(rawScores?.Pitta || 0);
  const kapha = Number(rawScores?.Kapha || 0);
  const total = Math.max(vata + pitta + kapha, 0.0001);
  return {
    Vata: Math.round((vata / total) * 100),
    Pitta: Math.round((pitta / total) * 100),
    Kapha: Math.round((kapha / total) * 100)
  };
}

function orderedDoshasFromPercent(percentages) {
  return [
    { key: 'Vata', score: Number(percentages?.Vata || 0) },
    { key: 'Pitta', score: Number(percentages?.Pitta || 0) },
    { key: 'Kapha', score: Number(percentages?.Kapha || 0) }
  ].sort((a, b) => b.score - a.score);
}

function calculateVikritiSeverity(vikritiPercentages, symptomCount) {
  const ordered = orderedDoshasFromPercent(vikritiPercentages);
  const top = Number(ordered[0]?.score || 0);
  const second = Number(ordered[1]?.score || 0);
  const dominanceGap = top - second;
  if (symptomCount === 0 || top < 34) return 'Balanced';
  if (top >= 50 && dominanceGap >= 15) return 'High';
  if (top >= 42 && dominanceGap >= 8) return 'Moderate';
  return 'Low';
}

function evaluateDoshaAssessment(payload) {
  const questionMap = getDoshaQuestionMap();
  const answers = payload && typeof payload.answers === 'object' && !Array.isArray(payload.answers) ? payload.answers : {};
  const symptomSelections = Array.isArray(payload?.symptoms) ? payload.symptoms : [];
  const symptomSeverityWeight = { Low: 1, Medium: 2, High: 3 };

  const prakritiRaw = { Vata: 0, Pitta: 0, Kapha: 0 };
  const vikritiRaw = { Vata: 0, Pitta: 0, Kapha: 0 };
  let answeredQuestions = 0;

  for (const [questionKey, optionKey] of Object.entries(answers)) {
    const question = questionMap.get(String(questionKey || ''));
    if (!question) continue;
    const option = (question.options || []).find((item) => item.key === String(optionKey || ''));
    if (!option) continue;
    answeredQuestions += 1;
    const qWeight = Number(question.weight || 1);
    const map = option.map || {};
    prakritiRaw.Vata += Number(map.Vata || 0) * qWeight;
    prakritiRaw.Pitta += Number(map.Pitta || 0) * qWeight;
    prakritiRaw.Kapha += Number(map.Kapha || 0) * qWeight;
  }

  for (const symptom of symptomSelections) {
    const found = DOSHA_SYMPTOM_OPTIONS.find((item) => item.key === String(symptom?.key || ''));
    if (!found) continue;
    const sev = String(symptom?.severity || 'Low');
    const sevWeight = symptomSeverityWeight[sev] || 1;
    vikritiRaw.Vata += Number(found.map?.Vata || 0) * sevWeight;
    vikritiRaw.Pitta += Number(found.map?.Pitta || 0) * sevWeight;
    vikritiRaw.Kapha += Number(found.map?.Kapha || 0) * sevWeight;
  }

  const prakritiScores = normalizeDoshaPercentages(prakritiRaw);
  const vikritiScores = normalizeDoshaPercentages(vikritiRaw);
  const prakritiOrder = orderedDoshasFromPercent(prakritiScores);
  const vikritiOrder = orderedDoshasFromPercent(vikritiScores);
  const primaryDosha = String(prakritiOrder[0]?.key || 'Vata');
  const secondaryDosha = Number(prakritiOrder[1]?.score || 0) > 0 ? String(prakritiOrder[1]?.key || '') : '';
  const symptomCount = symptomSelections.length;
  const vikritiDominant = symptomCount === 0 ? 'Balanced' : String(vikritiOrder[0]?.key || 'Balanced');
  const vikritiSeverity = calculateVikritiSeverity(vikritiScores, symptomCount);
  const confidence = calculateDoshaConfidence(
    DOSHA_QUESTION_SECTIONS.reduce((acc, section) => acc + Number(section.questions?.length || 0), 0),
    answeredQuestions,
    symptomCount
  );

  const summaryLine =
    vikritiDominant === 'Balanced'
      ? `Your constitution shows a ${primaryDosha}-dominant pattern${secondaryDosha ? ` with ${secondaryDosha} influence` : ''}. Current imbalance appears balanced.`
      : `Your constitution shows a ${primaryDosha}-dominant pattern${secondaryDosha ? ` with ${secondaryDosha} influence` : ''}. Current imbalance suggests ${vikritiSeverity.toLowerCase()} ${vikritiDominant} aggravation.`;

  return {
    answers,
    symptoms: symptomSelections,
    prakritiScores,
    vikritiScores,
    primaryDosha,
    secondaryDosha: secondaryDosha || null,
    vikritiDominant,
    vikritiSeverity,
    confidence,
    summaryLine
  };
}

function mapDoshaRowToRecord(row) {
  const answers = typeof row.answers_json === 'string' ? safeJsonParseObject(row.answers_json, {}) : row.answers_json || {};
  const symptoms = typeof row.symptoms_json === 'string' ? safeJsonParseArray(row.symptoms_json, []) : row.symptoms_json || [];
  const prakritiScores = typeof row.prakriti_scores_json === 'string' ? safeJsonParseObject(row.prakriti_scores_json, { Vata: 0, Pitta: 0, Kapha: 0 }) : row.prakriti_scores_json || { Vata: 0, Pitta: 0, Kapha: 0 };
  const vikritiScores = typeof row.vikriti_scores_json === 'string' ? safeJsonParseObject(row.vikriti_scores_json, { Vata: 0, Pitta: 0, Kapha: 0 }) : row.vikriti_scores_json || { Vata: 0, Pitta: 0, Kapha: 0 };
  
  const primary = String(row.primary_dosha || 'Vata');
  const secondary = String(row.secondary_dosha || '').trim();
  const dominant = String(row.vikriti_dominant || 'Balanced');
  const severity = String(row.vikriti_severity || 'Balanced');

  return {
    id: row.id,
    userId: row.user_id,
    source: row.source || 'self_assessed',
    assessmentDate: row.created_at,
    validTill: new Date(new Date(row.created_at).getTime() + DOSHA_REASSESS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    selfReported: true,
    answers,
    scores: {
      vata: Number(prakritiScores.Vata || 0),
      pitta: Number(prakritiScores.Pitta || 0),
      kapha: Number(prakritiScores.Kapha || 0)
    },
    prakriti: {
      primary,
      secondary: secondary || undefined,
      isDual: !!secondary && Number(prakritiScores[primary] || 0) === Number(prakritiScores[secondary] || 0),
      scores: {
        vata: Number(prakritiScores.Vata || 0),
        pitta: Number(prakritiScores.Pitta || 0),
        kapha: Number(prakritiScores.Kapha || 0)
      },
      percentages: {
        vata: Number(prakritiScores.Vata || 0),
        pitta: Number(prakritiScores.Pitta || 0),
        kapha: Number(prakritiScores.Kapha || 0)
      }
    },
    vikriti: {
      dominant,
      severity,
      symptomScores: {
        vata: Number(vikritiScores.Vata || 0),
        pitta: Number(vikritiScores.Pitta || 0),
        kapha: Number(vikritiScores.Kapha || 0)
      },
      symptoms,
      imbalanceFlag: dominant !== 'Balanced' && dominant !== primary
    },
    confidence: Number(row.confidence || 0),
    prakritiLabel: primary,
    vikritiLabel: dominant,
    primaryDosha: primary,
    secondaryDosha: secondary || undefined,
    result: secondary ? `${primary}-${secondary}` : primary,
    submittedAt: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listDoshaAssessmentsForUser(userId, limit = 12) {
  const { data, error } = await supabase
    .from('dosha_assessments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(48, Math.max(1, Number(limit || 12))));

  if (error) {
    console.error('Error listing dosha assessments:', error);
    return [];
  }
  return data.map(mapDoshaRowToRecord);
}

async function getLatestDoshaAssessmentForUser(userId) {
  const result = await listDoshaAssessmentsForUser(userId, 1);
  return result[0] || null;
}

async function getDoshaDraftForUser(userId) {
  const { data, error } = await supabase
    .from('dosha_assessment_drafts')
    .select('payload_json, updated_at')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching dosha draft:', error);
  }
  if (!data) return null;
  const payload = typeof data.payload_json === 'string' ? safeJsonParseObject(data.payload_json, {}) : data.payload_json;
  return { ...payload, updatedAt: data.updated_at || nowIso() };
}

async function saveDoshaDraftForUser(userId, payload) {
  const now = nowIso();
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  
  const { error } = await supabase
    .from('dosha_assessment_drafts')
    .upsert({
      user_id: userId,
      payload_json: safePayload,
      updated_at: now
    }, { onConflict: 'user_id' });

  if (error) {
    console.error('Error saving dosha draft:', error);
  }
  return { ...safePayload, updatedAt: now };
}

async function clearDoshaDraftForUser(userId) {
  const { error } = await supabase
    .from('dosha_assessment_drafts')
    .delete()
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error clearing dosha draft:', error);
  }
}

async function upsertUserProfileDoshaSnapshot(userId, latestRecord, history) {
  const now = nowIso();
  const snapshot = latestRecord
    ? {
        id: latestRecord.id,
        primaryDosha: latestRecord.primaryDosha,
        secondaryDosha: latestRecord.secondaryDosha || null,
        vikritiDominant: latestRecord.vikriti?.dominant || 'Balanced',
        confidence: Number(latestRecord.confidence || 0),
        createdAt: latestRecord.createdAt || latestRecord.submittedAt
      }
    : {};
  const compactHistory = (history || []).slice(0, 24).map((item) => ({
    id: item.id,
    primaryDosha: item.primaryDosha,
    secondaryDosha: item.secondaryDosha || null,
    vikritiDominant: item.vikriti?.dominant || 'Balanced',
    createdAt: item.createdAt || item.submittedAt
  }));

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: userId,
      latest_dosha_snapshot: snapshot,
      dosha_history: compactHistory,
      updated_at: now
    }, { onConflict: 'user_id' })
    .select('id')
    .single();

  if (error) {
    console.error('Error upserting user profile snapshot:', error);
    return null;
  }
  return data?.id;
}

async function getDoshaCooldownStatus(userId) {
  const latest = await getLatestDoshaAssessmentForUser(userId);
  if (!latest) return { canReassess: true, cooldownDays: DOSHA_REASSESS_COOLDOWN_DAYS, daysSinceLast: null, message: '' };
  const elapsedDays = Math.floor((Date.now() - new Date(latest.createdAt || latest.submittedAt).getTime()) / (24 * 60 * 60 * 1000));
  const canReassess = elapsedDays >= DOSHA_REASSESS_COOLDOWN_DAYS;
  const message = canReassess
    ? `Your last assessment was ${elapsedDays} day(s) ago. Reassessment is available.`
    : `Your last assessment was ${elapsedDays} day(s) ago. Reassessment is available after ${DOSHA_REASSESS_COOLDOWN_DAYS} days, unless advised by a doctor.`;
  return { canReassess, cooldownDays: DOSHA_REASSESS_COOLDOWN_DAYS, daysSinceLast: elapsedDays, latest, message };
}

function hasSevereDoshaSymptom(symptoms) {
  return (symptoms || []).some((item) => String(item?.severity || '') === 'High');
}

async function getDoctorProfileById(doctorId) {
  const { data, error } = await supabase
    .from('doctor_profiles')
    .select('*')
    .eq('id', doctorId)
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    specialization: data.specialization || 'General Ayurveda',
    experienceYears: Number(data.experience_years || 1),
    languages: typeof data.languages_json === 'string' ? safeJsonParseArray(data.languages_json, ['English']) : data.languages_json || ['English'],
    consultationModes: typeof data.consultation_modes_json === 'string' ? safeJsonParseArray(data.consultation_modes_json, ['chat']) : data.consultation_modes_json || ['chat'],
    isActive: !!data.is_active
  };
}

async function listActiveDoctorProfiles() {
  const { data, error } = await supabase
    .from('doctor_profiles')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Error listing doctors:', error);
    return [];
  }
  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    specialization: row.specialization || 'General Ayurveda',
    experienceYears: Number(row.experience_years || 1),
    languages: typeof row.languages_json === 'string' ? safeJsonParseArray(row.languages_json, ['English']) : row.languages_json || ['English'],
    consultationModes: typeof row.consultation_modes_json === 'string' ? safeJsonParseArray(row.consultation_modes_json, ['chat']) : row.consultation_modes_json || ['chat'],
    isActive: !!row.is_active
  }));
}

async function getDoctorRules(doctorId) {
  const { data, error } = await supabase
    .from('doctor_availability_rules')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('is_active', true);

  if (error) return [];
  return data.map((row) => ({
    id: row.id,
    weekday: Number(row.weekday),
    startMinute: Number(row.start_minute),
    endMinute: Number(row.end_minute),
    modes: typeof row.modes_json === 'string' ? safeJsonParseArray(row.modes_json, ['chat']) : row.modes_json || ['chat'],
    isActive: !!row.is_active
  }));
}

async function getDoctorUnavailableBlocks(doctorId, fromIso, toIso) {
  const { data, error } = await supabase
    .from('doctor_unavailable_blocks')
    .select('*')
    .eq('doctor_id', doctorId)
    .not('end_at', 'lte', fromIso)
    .not('start_at', 'gte', toIso);

  if (error) return [];
  return data.map(row => ({
    id: row.id,
    startAt: row.start_at,
    endAt: row.end_at,
    reason: row.reason
  }));
}

async function getDoctorScheduledBookings(doctorId, fromIso, toIso) {
  const { data, error } = await supabase
    .from('consultation_bookings')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('status', 'scheduled')
    .gte('scheduled_time', fromIso)
    .lt('scheduled_time', toIso);

  if (error) return [];
  return data.map(row => ({
    id: row.id,
    scheduledTime: row.scheduled_time,
    durationMinutes: row.duration_minutes,
    mode: row.mode,
    status: row.status
  }));
}

function toIsoDateOnly(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUtcMinuteOfDay(dateObj) {
  return dateObj.getUTCHours() * 60 + dateObj.getUTCMinutes();
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

async function computeDoctorSlots(doctorId, mode, days = 7, slotDurationMinutes = 30) {
  const normalizedMode = normalizeConsultationMode(mode);
  const now = Date.now();
  const start = new Date(now + 5 * 60 * 1000);
  const end = new Date(now + Math.max(1, days) * 24 * 60 * 60 * 1000);
  const fromIso = start.toISOString();
  const toIso = end.toISOString();
  
  const rules = await getDoctorRules(doctorId);
  if (!rules.length) return [];

  const blocksData = await getDoctorUnavailableBlocks(doctorId, fromIso, toIso);
  const blocks = blocksData.map((item) => ({
    start: new Date(item.startAt).getTime(),
    end: new Date(item.endAt).getTime()
  }));

  const bookingsData = await getDoctorScheduledBookings(doctorId, fromIso, toIso);
  const bookings = bookingsData.map((item) => {
    const slotStart = new Date(item.scheduledTime).getTime();
    const slotEnd = slotStart + Number(item.durationMinutes || 30) * 60 * 1000;
    return { start: slotStart, end: slotEnd };
  });

  const slots = [];
  for (let ts = start.getTime(); ts < end.getTime(); ts += 24 * 60 * 60 * 1000) {
    const day = new Date(ts);
    const weekday = day.getUTCDay();
    const dayStr = toIsoDateOnly(day);
    const dayRules = rules.filter((rule) => rule.weekday === weekday && rule.modes.includes(normalizedMode));
    if (!dayRules.length) continue;

    for (const rule of dayRules) {
      let minute = rule.startMinute;
      while (minute + slotDurationMinutes <= rule.endMinute) {
        const h = Math.floor(minute / 60);
        const m = minute % 60;
        const slotStartIso = `${dayStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
        const slotStart = new Date(slotStartIso).getTime();
        const slotEnd = slotStart + slotDurationMinutes * 60 * 1000;
        if (slotStart <= now + 2 * 60 * 1000) {
          minute += slotDurationMinutes;
          continue;
        }
        const blocked = blocks.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        const booked = bookings.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
        if (!blocked && !booked) {
          slots.push({
            startAt: new Date(slotStart).toISOString(),
            endAt: new Date(slotEnd).toISOString(),
            durationMinutes: slotDurationMinutes,
            mode: normalizedMode
          });
        }
        minute += slotDurationMinutes;
      }
    }
  }
  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}

function computeIssueRelevance(issueText, specializationText) {
  const issue = String(issueText || '').toLowerCase();
  const specialization = String(specializationText || '').toLowerCase();
  if (!issue || !specialization) return 0;
  const words = issue
    .split(/[^a-z0-9]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
  if (!words.length) return 0;
  let score = 0;
  for (const word of words) {
    if (specialization.includes(word)) score += 1;
  }
  return score;
}

function computeDoshaDoctorRelevance(doshaDominant, specializationText) {
  const dosha = String(doshaDominant || '').toLowerCase();
  const specialization = String(specializationText || '').toLowerCase();
  if (!dosha || !specialization) return 0;
  const mapping = {
    vata: ['stress', 'sleep', 'anxiety', 'nervous', 'pain', 'constipation'],
    pitta: ['acidity', 'inflammation', 'skin', 'liver', 'burning', 'migraine'],
    kapha: ['weight', 'metabolic', 'sinus', 'respiratory', 'congestion', 'thyroid']
  };
  const tokens = mapping[dosha] || [];
  let score = 0;
  for (const token of tokens) {
    if (specialization.includes(token)) score += 1;
  }
  return score;
}

function mapBookingRow(row) {
  return {
    id: row.id,
    patientId: row.patientId,
    doctorId: row.doctorId,
    mode: row.mode,
    scheduledTime: row.scheduledTime,
    duration: Number(row.durationMinutes || 30),
    status: row.status,
    issueContext: row.issueContext || '',
    notes: row.notes || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelledBy: row.cancelledBy || null,
    cancelledReason: row.cancelledReason || null
  };
}

async function getUserBookings(userId, role) {
  let query = supabase.from('consultation_bookings').select('*');
  
  if (role === 'doctor') {
    // Join with doctor_profiles to find bookings by user_id of the doctor
    const { data: doctor } = await supabase
      .from('doctor_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();
      
    if (!doctor) return [];
    query = query.eq('doctor_id', doctor.id);
  } else {
    query = query.eq('patient_id', userId);
  }

  const { data, error } = await query.order('scheduled_time', { ascending: false });

  if (error) {
    console.error('Error fetching user bookings:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    mode: row.mode,
    scheduledTime: row.scheduled_time,
    duration: Number(row.duration_minutes || 30),
    status: row.status,
    issueContext: row.issue_context || '',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledBy: row.cancelled_by || null,
    cancelledReason: row.cancelled_reason || null
  }));
}

async function getContinuityForPatient(patientId, limit = 8) {
  // Use RPC or multiple queries as Supabase doesn't support complex aggregations with joins easily in client
  const { data: summary, error: summaryError } = await supabase
    .from('consultation_bookings')
    .select('doctor_id, scheduled_time, status')
    .eq('patient_id', patientId)
    .neq('status', 'cancelled')
    .order('scheduled_time', { ascending: false });

  if (summaryError) {
    console.error('Error fetching continuity summary:', summaryError);
    return [];
  }

  const doctorsMap = new Map();
  summary.forEach(row => {
    if (!doctorsMap.has(row.doctor_id)) {
      doctorsMap.set(row.doctor_id, {
        doctorId: row.doctor_id,
        lastConsultedAt: row.scheduled_time,
        totalBooked: 0,
        totalCompleted: 0
      });
    }
    const agg = doctorsMap.get(row.doctor_id);
    agg.totalBooked++;
    if (row.status === 'completed') agg.totalCompleted++;
  });

  const continuityList = Array.from(doctorsMap.values()).slice(0, Math.max(1, Math.min(20, Number(limit || 8))));

  const result = await Promise.all(continuityList.map(async (row) => {
    const doctor = await getDoctorProfileById(row.doctorId);
    
    const { data: nextScheduled } = await supabase
      .from('consultation_bookings')
      .select('scheduled_time')
      .eq('patient_id', patientId)
      .eq('doctor_id', row.doctorId)
      .eq('status', 'scheduled')
      .gte('scheduled_time', nowIso())
      .order('scheduled_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: lastIssues } = await supabase
      .from('consultation_bookings')
      .select('issue_context')
      .eq('patient_id', patientId)
      .eq('doctor_id', row.doctorId)
      .not('issue_context', 'is', null)
      .order('scheduled_time', { ascending: false })
      .limit(3);

    return {
      doctorId: String(row.doctorId || ''),
      doctorName: doctor?.name || 'Doctor',
      specialization: doctor?.specialization || 'General Ayurveda',
      lastConsultedAt: String(row.lastConsultedAt || ''),
      nextScheduledAt: nextScheduled?.scheduled_time || null,
      totalBooked: Number(row.totalBooked || 0),
      totalCompleted: Number(row.totalCompleted || 0),
      recentIssues: [...new Set((lastIssues || []).map(i => String(i.issue_context || '').trim()).filter(Boolean))].slice(0, 3)
    };
  }));

  return result;
}

async function getPatientProfileSnapshotFromState(patientId) {
  const userState = await getUserState(patientId);
  const state = userState.state || {};
  const patients = safeJsonParseByType(state?.ayustra_patients, []);
  const patient = Array.isArray(patients)
    ? patients.find((item) => String(item?.id || '') === String(patientId || '')) || null
    : null;
  if (!patient || typeof patient !== 'object') return null;
  return {
    age: Number(patient?.age || patient?.profile?.age || 0) || null,
    gender: String(patient?.gender || patient?.profile?.gender || '').trim() || null,
    location: String(patient?.location || patient?.profile?.location || '').trim() || null,
    allergies: Array.isArray(patient?.allergies)
      ? patient.allergies.map((a) => String(a || '').trim()).filter(Boolean).slice(0, 8)
      : Array.isArray(patient?.healthData?.allergies)
        ? patient.healthData.allergies.map((a) => String(a || '').trim()).filter(Boolean).slice(0, 8)
        : [],
    medications: Array.isArray(patient?.currentMedications)
      ? patient.currentMedications
          .map((m) => String(m?.name || '').trim())
          .filter(Boolean)
          .slice(0, 8)
      : []
  };
}

async function fetchDoctorProfileForUser(userId) {
  const { data, error } = await supabase
    .from('doctor_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    specialization: data.specialization,
    experienceYears: data.experience_years,
    languages: typeof data.languages_json === 'string' ? safeJsonParseArray(data.languages_json, []) : data.languages_json,
    consultationModes: typeof data.consultation_modes_json === 'string' ? safeJsonParseArray(data.consultation_modes_json, []) : data.consultation_modes_json,
    isActive: data.is_active
  };
}

function isParticipant(session, userId) {
  return session.patientId === userId || session.doctorId === userId;
}

function emitSessionState(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  // Realtime updates handled via Supabase
}

function sanitizeQuery(input) {
  return String(input || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s\-\(\)\.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function canProceedRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const bucket = rateStore.get(key) || { start: now, count: 0 };
  if (now - bucket.start > rateWindowMs) {
    rateStore.set(key, { start: now, count: 1 });
    return true;
  }
  if (bucket.count >= maxRequestsPerWindow) return false;
  bucket.count += 1;
  rateStore.set(key, bucket);
  return true;
}

async function fetchJsonWithRetry(url, timeoutMs = 8000) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Request failed');
}

async function fetchTextWithRetry(url, timeoutMs = 8000) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/html,application/json' } });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Request failed');
}

function emptyNormalized(name) {
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    type: 'herb',
    botanicalName: '',
    classicalNames: [],
    description: '',
    ayurvedicProperties: {
      rasa: '',
      guna: '',
      virya: '',
      vipaka: '',
      doshaEffect: ''
    },
    therapeuticUses: [],
    usageGuidelines: '',
    dosageForms: '',
    precautions: '',
    contraindications: '',
    sideEffects: '',
    pregnancySafety: '',
    scientificEvidence: [],
    references: [],
    prescriptionOnly: false,
    disclaimer: 'Consult an Ayurvedic doctor before use'
  };
}

function mergeUnique(base, incoming) {
  const set = new Set((base || []).filter(Boolean));
  (incoming || []).filter(Boolean).forEach((v) => set.add(v));
  return [...set];
}

function mergeInfo(base, incoming) {
  const merged = { ...base };
  for (const key of ['name', 'type', 'botanicalName', 'description', 'usageGuidelines', 'dosageForms', 'precautions', 'contraindications', 'sideEffects', 'pregnancySafety']) {
    if (!merged[key] && incoming[key]) merged[key] = incoming[key];
  }
  merged.classicalNames = mergeUnique(base.classicalNames, incoming.classicalNames);
  merged.therapeuticUses = mergeUnique(base.therapeuticUses, incoming.therapeuticUses);
  merged.references = mergeUnique(base.references, incoming.references);
  merged.scientificEvidence = [...(base.scientificEvidence || []), ...(incoming.scientificEvidence || [])];
  merged.ayurvedicProperties = {
    rasa: base.ayurvedicProperties?.rasa || incoming.ayurvedicProperties?.rasa || '',
    guna: base.ayurvedicProperties?.guna || incoming.ayurvedicProperties?.guna || '',
    virya: base.ayurvedicProperties?.virya || incoming.ayurvedicProperties?.virya || '',
    vipaka: base.ayurvedicProperties?.vipaka || incoming.ayurvedicProperties?.vipaka || '',
    doshaEffect: base.ayurvedicProperties?.doshaEffect || incoming.ayurvedicProperties?.doshaEffect || ''
  };
  merged.prescriptionOnly = !!(base.prescriptionOnly || incoming.prescriptionOnly);
  return merged;
}

async function fetchOpenAyurvedaData(query) {
  const candidates = [
    'https://raw.githubusercontent.com/OpenAyurveda/open-ayurveda-datasets/main/herbs.json',
    'https://raw.githubusercontent.com/OpenAyurveda/open-ayurveda-datasets/main/formulations.json',
    'https://raw.githubusercontent.com/OpenAyurveda/open-ayurveda-datasets/main/medicines.json'
  ];
  for (const url of candidates) {
    try {
      const data = await fetchJsonWithRetry(url, 6000);
      if (!Array.isArray(data)) continue;
      const lower = query.toLowerCase();
      const found = data.find((item) => String(item.name || item.commonName || '').toLowerCase() === lower) ||
        data.find((item) => String(item.name || item.commonName || '').toLowerCase().includes(lower));
      if (!found) continue;
      return {
        ...emptyNormalized(String(found.name || found.commonName || query)),
        type: String(found.type || found.category || 'herb').toLowerCase().includes('form') ? 'formulation' : 'herb',
        botanicalName: String(found.botanicalName || found.botanical || ''),
        classicalNames: Array.isArray(found.classicalNames) ? found.classicalNames : [],
        description: String(found.description || ''),
        ayurvedicProperties: {
          rasa: String(found.rasa || ''),
          guna: String(found.guna || ''),
          virya: String(found.virya || ''),
          vipaka: String(found.vipaka || ''),
          doshaEffect: String(found.doshaEffect || found.dosha || '')
        },
        therapeuticUses: Array.isArray(found.therapeuticUses) ? found.therapeuticUses : [],
        usageGuidelines: String(found.usageGuidelines || ''),
        dosageForms: String(found.dosageForms || found.form || ''),
        precautions: String(found.precautions || ''),
        contraindications: String(found.contraindications || ''),
        sideEffects: String(found.sideEffects || ''),
        pregnancySafety: String(found.pregnancySafety || ''),
        references: [url]
      };
    } catch {
      // try next source
    }
  }
  return null;
}

async function fetchAyushPortalData(query) {
  const url = `https://www.ayushresearchportal.nic.in/jspui/simple-search?query=${encodeURIComponent(query)}`;
  try {
    const html = await fetchTextWithRetry(url, 7000);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text.toLowerCase().includes(query.toLowerCase())) return null;
    return {
      ...emptyNormalized(query),
      description: text.slice(0, 500),
      references: [url],
      therapeuticUses: []
    };
  } catch {
    return null;
  }
}

async function fetchDataGovAyushData(query) {
  const url = `https://catalog.data.gov.in/api/3/action/package_search?q=${encodeURIComponent(`ayush ${query}`)}&rows=5`;
  try {
    const data = await fetchJsonWithRetry(url, 7000);
    const results = data?.result?.results;
    if (!Array.isArray(results) || results.length === 0) return null;
    const best = results[0];
    return {
      ...emptyNormalized(query),
      description: String(best.notes || best.title || '').slice(0, 500),
      references: [`https://catalog.data.gov.in/dataset/${best.name || ''}`],
      therapeuticUses: []
    };
  } catch {
    return null;
  }
}

async function fetchPubChemData(query) {
  try {
    const propsUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/property/IUPACName,MolecularFormula/JSON`;
    const props = await fetchJsonWithRetry(propsUrl, 7000);
    const row = props?.PropertyTable?.Properties?.[0];
    if (!row) return null;

    return {
      ...emptyNormalized(query),
      type: 'herb',
      botanicalName: '',
      description: row.IUPACName ? `PubChem compound information: ${row.IUPACName}` : '',
      scientificEvidence: [
        {
          source: 'PubChem',
          summary: `Molecular formula: ${row.MolecularFormula || 'N/A'}`,
          link: `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(query)}`
        }
      ],
      references: [`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(query)}`]
    };
  } catch {
    return null;
  }
}

async function fetchWikipediaFallback(query) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const data = await fetchJsonWithRetry(url, 7000);
    if (!data || !data.extract) return null;
    return {
      ...emptyNormalized(data.title || query),
      description: String(data.extract || '').slice(0, 800),
      references: [data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`],
      scientificEvidence: [
        {
          source: 'Wikipedia',
          summary: 'General encyclopedic context',
          link: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`
        }
      ]
    };
  } catch {
    return null;
  }
}

async function resolveMedicineInfo(query) {
  const normalized = emptyNormalized(query);
  const sourceResults = await Promise.all([
    fetchOpenAyurvedaData(query),
    fetchAyushPortalData(query),
    fetchDataGovAyushData(query),
    fetchPubChemData(query)
  ]);
  let merged = { ...normalized };
  sourceResults.filter(Boolean).forEach((part) => {
    merged = mergeInfo(merged, part);
  });
  if (!merged.description) {
    const wiki = await fetchWikipediaFallback(query);
    if (wiki) merged = mergeInfo(merged, wiki);
  }
  const hasData = !!(
    merged.description ||
    merged.botanicalName ||
    merged.therapeuticUses.length ||
    merged.references.length ||
    merged.scientificEvidence.length
  );
  return hasData ? merged : null;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: nowIso() });
});

app.post(['/api/auth/signup', '/auth/signup'], async (req, res) => {
  try {
    const { email, password, name, ...otherFields } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const signupResult = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, ...otherFields }
    });
    if (!signupResult) {
      return res.status(500).json({ error: 'Auth service failed to respond' });
    }
    const { data: authData, error: authError } = signupResult;
    if (authError) {
      console.error('Signup error:', authError);
      if (authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      return res.status(400).json({ error: authError.message });
    }
    const { error: profileError } = await supabase
      .from('users')
      .insert({ id: authData.user.id, email, name, ...otherFields });
    if (profileError) console.error('Profile insert error:', profileError);
    return res.status(201).json({ message: 'Account created successfully', user: authData.user });
  } catch (err) {
    console.error('Signup exception:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (!result) return res.status(500).json({ error: 'Auth signin failed (result undefined)' });
    const { data, error } = result;
    
    if (error) return res.status(401).json({ error: 'Invalid credentials' });

    return res.json({ session: data.session, user: data.user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(['/api/auth/logout', '/auth/logout'], authRequired, async (req, res) => {
  await supabase.auth.signOut();
  return res.json({ message: 'Logged out' });
});

// Move to the top of auth routes
// [REMOVED DUPLICATE /ME ROUTE]

app.post(['/api/auth/logout', '/auth/logout'], authRequired, async (req, res) => {
  await supabase.auth.signOut();
  return res.json({ success: true });
});

app.put('/api/auth/me', authRequired, async (req, res) => {
  try {    const userId = String(req.user?.id || '');
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const hasPhoneField = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone');
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }
    const updatePayload = {
      name,
      updated_at: new Date().toISOString()
    };
    if (hasPhoneField) {
      updatePayload.phone = phone;
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    const updated = await getUserById(userId);
    if (!updated) return res.status(404).json({ error: 'Account does not exist.' });
    return res.json({
      user: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone || '',
        email: updated.email,
        role: updated.role,
        isVerified: !!updated.isVerified,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to update profile.' });
  }
});

app.post('/api/medical-reports/analyze', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    if (normalizeRole(req.user.user_metadata?.role) !== 'patient') {
      return res.status(403).json({ error: 'Only patient accounts can upload medical reports.' });
    }

    const { filePath, fileName } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'Storage file path is required.' });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('medical-reports')
      .download(filePath);

    if (downloadError || !fileData) {
      return res.status(404).json({ error: 'Unable to retrieve report file from storage.' });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const ext = path.extname(fileName || filePath).toLowerCase();
    const kind = ext === '.pdf' ? 'pdf' : 'image';

    const extractedText = await extractTextFromMedicalReport(buffer, kind);
    const analysisResult = analyzeMedicalReportText(extractedText);
    
    const created = await createMedicalReportRecord({
      userId,
      filePath,
      extractedText,
      analysisResult
    });

    return res.status(201).json({
      report: toMedicalReportResponse(created, true),
      message: 'Medical report analyzed successfully.'
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to analyze medical report.' });
  }
});

app.get('/api/medical-reports', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    const rows = await getMedicalReportsForUser(userId);
    const reports = rows.map((row) => toMedicalReportResponse(row, false));
    return res.json({ reports });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to fetch reports.' });
  }
});

app.get('/api/medical-reports/:reportId', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    const reportId = String(req.params?.reportId || '').trim();
    if (!reportId) return res.status(400).json({ error: 'Report id is required.' });

    const report = await getMedicalReportByIdForUser(reportId, userId);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    return res.json({ report: toMedicalReportResponse(report, true) });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to load report.' });
  }
});

app.delete('/api/medical-reports/:reportId', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    const reportId = String(req.params?.reportId || '').trim();
    if (!reportId) return res.status(400).json({ error: 'Report id is required.' });

    const report = await getMedicalReportByIdForUser(reportId, userId);
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    const deletion = await deleteMedicalReportByIdForUser(reportId, userId);
    if (!Number(deletion?.changes || 0)) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    const absolutePath = resolveMedicalReportAbsolutePath(report.file_path);
    safeDeleteFile(absolutePath);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to delete report.' });
  }
});

app.get('/api/user/state', authRequired, async (req, res) => {
  const userId = String(req.user?.id || '');
  if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
  const record = await getUserState(userId);
  return res.json({
    userId,
    state: record.state,
    updatedAt: record.updatedAt
  });
});

app.put('/api/user/state', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    if (!userId) return res.status(401).json({ error: 'Unauthorized.' });
    const incomingState = req.body?.state;
    const saved = await upsertUserState(userId, incomingState);
    io.to(`user_state_${userId}`).emit('state-updated', {
      userId,
      updatedAt: saved.updatedAt
    });
    return res.json({
      userId,
      state: saved.state,
      updatedAt: saved.updatedAt
    });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'Unable to save state.' });
  }
});

app.get('/api/dosha/config', authRequired, async (req, res) => {
  const userId = String(req.user?.id || '');
  const role = normalizeRole(req.user.user_metadata?.role);
  if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
  const cooldown = await getDoshaCooldownStatus(userId);
  const latest = await getLatestDoshaAssessmentForUser(userId);
  return res.json({
    sections: DOSHA_QUESTION_SECTIONS,
    symptoms: DOSHA_SYMPTOM_OPTIONS,
    cooldown,
    latestAssessment: latest
  });
});

app.get('/api/dosha/draft', authRequired, async (req, res) => {
  const userId = String(req.user?.id || '');
  const role = normalizeRole(req.user.user_metadata?.role);
  if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
  const draft = await getDoshaDraftForUser(userId);
  return res.json({ draft });
});

app.put('/api/dosha/draft', authRequired, async (req, res) => {
  const userId = String(req.user?.id || '');
  const role = normalizeRole(req.user.user_metadata?.role);
  if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
  const payload = req.body?.draft;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'draft payload is required.' });
  }
  const saved = await saveDoshaDraftForUser(userId, payload);
  return res.json({ draft: saved });
});

app.get('/api/dosha/assessments', authRequired, async (req, res) => {
  const userId = String(req.user?.id || '');
  const role = normalizeRole(req.user.user_metadata?.role);
  if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
  const limit = Math.min(48, Math.max(1, Number(req.query.limit || 12)));
  const history = await listDoshaAssessmentsForUser(userId, limit);
  const latest = history[0] || null;
  const cooldown = await getDoshaCooldownStatus(userId);
  return res.json({ history, latest, cooldown });
});

app.post('/api/dosha/assessment', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });

    const doctorApproved = !!req.body?.doctorApproved;
    const force = !!req.body?.force;
    const answers = req.body?.answers;
    const symptoms = Array.isArray(req.body?.symptoms) ? req.body.symptoms : [];
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers are required.' });
    }

    const cooldown = await getDoshaCooldownStatus(userId);
    if (!cooldown.canReassess && !doctorApproved && !force) {
      return res.status(409).json({
        error: cooldown.message || 'Reassessment cooldown is active.',
        cooldown
      });
    }

    const evaluated = evaluateDoshaAssessment({ answers, symptoms });
    const severeSymptom = hasSevereDoshaSymptom(evaluated.symptoms);
    const now = nowIso();

    // Migrating withTransaction block to individual Supabase steps
    const { data: assessmentData, error: assessmentError } = await supabase
      .from('dosha_assessments')
      .insert([{
        user_id: String(userId || ''),
        answers_json: evaluated.answers || {},
        symptoms_json: evaluated.symptoms || [],
        prakriti_scores_json: evaluated.prakritiScores || {},
        vikriti_scores_json: evaluated.vikritiScores || {},
        primary_dosha: String(evaluated.primaryDosha || 'Vata'),
        secondary_dosha: evaluated.secondaryDosha ? String(evaluated.secondaryDosha) : null,
        vikriti_dominant: String(evaluated.vikritiDominant || 'Balanced'),
        vikriti_severity: String(evaluated.vikritiSeverity || 'Balanced'),
        confidence: Number(evaluated.confidence || 0),
        source: 'self_assessed',
        created_at: now,
        updated_at: now
      }])
      .select('*')
      .single();

    if (assessmentError) {
      console.error('Error creating assessment:', assessmentError);
      throw assessmentError;
    }

    await clearDoshaDraftForUser(userId);
    const history = await listDoshaAssessmentsForUser(userId, 24);
    const created = history[0] || mapDoshaRowToRecord(assessmentData);
    await upsertUserProfileDoshaSnapshot(userId, created, history);

    await logHealthTimelineEvent(userId, {
      eventType: 'dosha_assessment',
      title: 'Dosha assessment completed',
      details: evaluated.summaryLine,
      metadata: {
        assessmentId: created?.id,
        primaryDosha: evaluated.primaryDosha || 'Vata',
        vikritiDominant: evaluated.vikritiDominant || 'Balanced',
        confidence: Number(evaluated.confidence || 0)
      },
      occurredAt: created?.submittedAt || now
    });

    return res.status(201).json({
      record: created,
      summary: evaluated.summaryLine,
      supportiveNotice: 'This assessment is supportive and not a medical diagnosis.',
      safety: severeSymptom
        ? 'You reported high-severity symptoms. Please consult a doctor promptly for medical evaluation.'
        : null
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to submit dosha assessment.' });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const body = req.body || {};
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = normalizeEmail(body.email);
    const phone = String(body.phone || '').trim();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();
    const userId = String(body.userId || optionalAuth(req) || '').trim();

    if (!firstName || !email || !message) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ error: 'Invalid phone number.' });
    }

    const createdAt = nowIso();
    const { data, error } = await supabase
      .from('contact_submissions')
      .insert([{
        user_id: userId || null,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        subject,
        message,
        created_at: createdAt
      }])
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return res.json({
      item: {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone,
        subject: data.subject,
        message: data.message,
        userId: data.user_id || undefined,
        createdAt: data.created_at
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to save contact request.' });
  }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const userId = String(req.body?.userId || optionalAuth(req) || '').trim();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    
    const { data: existing, error: fetchError } = await supabase
      .from('newsletter_subscriptions')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Email already subscribed.', duplicate: true });
    }

    const { error: insertError } = await supabase
      .from('newsletter_subscriptions')
      .insert([{
        email,
        user_id: userId || null,
        created_at: nowIso()
      }]);

    if (insertError) {
      throw insertError;
    }
    
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to save newsletter subscription.' });
  }
});

app.get('/api/store/products', async (req, res) => {
  const category = req.query.category;
  let query = supabase.from('products').select('*');
  if (category) query = query.eq('category', category);
  const result = await query;
  if (!result) return res.status(500).json({ error: 'Database query failed (result undefined)' });
  const { data, error } = result;
  if (error) {
    console.error('products error:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.get('/api/store/categories', async (req, res) => {
  const result = await supabase.from('categories').select('*');
  if (!result) return res.status(500).json({ error: 'Database query failed (result undefined)' });
  const { data, error } = result;
  if (error) {
    console.error('categories error:', error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.get('/api/consultation/recommendation', authRequired, (req, res) => {
  const userId = String(req.user?.id || '');
  const role = normalizeRole(req.user.user_metadata?.role);
  if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
  const urgency = String(req.query.urgency || '').trim().toLowerCase();
  const issue = String(req.query.issue || '').trim();
  const mode = urgency === 'high' ? 'video' : issue.length > 80 ? 'audio' : 'chat';
  const suggestion = issue || 'Digestive imbalance and stress-related symptoms';
  return res.json({
    mode,
    issueSuggestion: suggestion.slice(0, 160),
    reasons: [
      urgency === 'high' ? 'Urgent concern detected, video consultation is recommended.' : 'Chat gives fastest first response.',
      'You can switch mode later if needed.'
    ]
  });
});

app.get('/api/consultation/doctors', authRequired, async (req, res) => {
  try {
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!role) return res.status(401).json({ error: 'Unauthorized.' });
    const userId = String(req.user?.id || '');
    const mode = normalizeConsultationMode(req.query.mode);
    const issue = String(req.query.issue || '').trim();
    const latestDosha = role === 'patient' ? await getLatestDoshaAssessmentForUser(userId) : null;
    const dominant = String(latestDosha?.vikriti?.dominant || latestDosha?.primaryDosha || '').trim();
    
    const allDoctors = await listActiveDoctorProfiles();
    const filteredDoctors = allDoctors.filter((doctor) => doctor.consultationModes.includes(mode));
    
    const doctorsWithSlots = await Promise.all(filteredDoctors.map(async (doctor) => {
      const slots = await computeDoctorSlots(doctor.id, mode, 7, 30);
      const relevance = computeIssueRelevance(issue, doctor.specialization);
      const doshaRelevance = computeDoshaDoctorRelevance(dominant, doctor.specialization);
      return {
        id: doctor.id,
        name: doctor.name,
        specialization: doctor.specialization.split(',').map((x) => x.trim()).filter(Boolean),
        experienceYears: doctor.experienceYears,
        languages: doctor.languages,
        consultationModes: doctor.consultationModes,
        nextAvailableSlot: slots[0]?.startAt || null,
        relevanceScore: relevance + doshaRelevance
      };
    }));

    const doctors = doctorsWithSlots.sort((a, b) => {
      const aHas = a.nextAvailableSlot ? 1 : 0;
      const bHas = b.nextAvailableSlot ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (a.relevanceScore !== b.relevanceScore) return b.relevanceScore - a.relevanceScore;
      if (!a.nextAvailableSlot || !b.nextAvailableSlot) return a.name.localeCompare(b.name);
      return a.nextAvailableSlot.localeCompare(b.nextAvailableSlot);
    });

    return res.json({
      mode,
      doctors
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to load doctors.' });
  }
});

app.get('/api/consultation/availability', authRequired, async (req, res) => {
  try {
    const doctorId = String(req.query.doctorId || '').trim();
    const mode = normalizeConsultationMode(req.query.mode);
    const days = Math.min(14, Math.max(1, Number(req.query.days || 7)));
    if (!doctorId) return res.status(400).json({ error: 'doctorId is required.' });
    const doctor = await getDoctorProfileById(doctorId);
    if (!doctor || !doctor.isActive) return res.status(404).json({ error: 'Doctor not found.' });
    const slots = await computeDoctorSlots(doctorId, mode, days, 30);
    return res.json({
      doctorId,
      mode,
      generatedAt: nowIso(),
      slots
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to fetch availability.' });
  }
});

app.post('/api/consultation/book', authRequired, async (req, res) => {
  try {
    const patientId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!patientId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });

    const mode = normalizeConsultationMode(req.body?.mode);
    const autoAssign = !!req.body?.autoAssign;
    const requestedDoctorId = String(req.body?.doctorId || '').trim();
    const scheduledTime = String(req.body?.scheduledTime || '').trim();
    const duration = Math.min(60, Math.max(15, Number(req.body?.duration || 30)));
    const issueContext = String(req.body?.issueContext || '').trim().slice(0, 320);
    if (!scheduledTime) return res.status(400).json({ error: 'scheduledTime is required.' });

    const slotStart = new Date(scheduledTime);
    if (Number.isNaN(slotStart.getTime()) || slotStart.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future.' });
    }
    const normalizedSlot = new Date(Math.floor(slotStart.getTime() / (30 * 60 * 1000)) * (30 * 60 * 1000)).toISOString();

    let doctorId = requestedDoctorId;
    if (autoAssign || !doctorId) {
      const allDoctors = await listActiveDoctorProfiles();
      const doctorsWithDetails = await Promise.all(allDoctors
        .filter((doctor) => doctor.consultationModes.includes(mode))
        .map(async (doctor) => {
          const slots = await computeDoctorSlots(doctor.id, mode, 7, 30);
          const relevance = computeIssueRelevance(issueContext, doctor.specialization);
          return { doctorId: doctor.id, slots, relevance };
        }));

      const sortedDoctors = doctorsWithDetails.sort((a, b) => {
        const aHasRequested = a.slots.some((s) => s.startAt === normalizedSlot) ? 1 : 0;
        const bHasRequested = b.slots.some((s) => s.startAt === normalizedSlot) ? 1 : 0;
        if (aHasRequested !== bHasRequested) return bHasRequested - aHasRequested;
        if (a.relevance !== b.relevance) return b.relevance - a.relevance;
        const aNext = a.slots[0]?.startAt || '';
        const bNext = b.slots[0]?.startAt || '';
        return aNext.localeCompare(bNext);
      });
      doctorId = sortedDoctors[0]?.doctorId || '';
    }

    if (!doctorId) return res.status(409).json({ error: 'No available doctor right now. Please retry shortly.' });
    const doctor = await getDoctorProfileById(doctorId);
    if (!doctor || !doctor.isActive) return res.status(404).json({ error: 'Doctor not available.' });
    if (!doctor.consultationModes.includes(mode)) {
      return res.status(400).json({ error: `Selected doctor does not support ${mode} consultation.` });
    }

    const availableSlots = await computeDoctorSlots(doctorId, mode, 7, 30);
    if (!availableSlots.some((slot) => slot.startAt === normalizedSlot)) {
      const alternatives = availableSlots.slice(0, 3).map((slot) => slot.startAt);
      return res.status(409).json({
        error: 'This slot was just booked. Please choose another slot.',
        alternatives
      });
    }

    const now = nowIso();
    
    // Manual check for conflict since we don't have atomic transactions like SQLite withTransaction here
    const { data: conflict } = await supabase
      .from('consultation_bookings')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('scheduled_time', normalizedSlot)
      .eq('status', 'scheduled')
      .maybeSingle();

    if (conflict) {
      return res.status(409).json({ error: 'This slot is no longer available. Please pick another slot.' });
    }

    const { data: record, error: bookingError } = await supabase
      .from('consultation_bookings')
      .insert([{
        patient_id: patientId,
        doctor_id: doctorId,
        mode,
        scheduled_time: normalizedSlot,
        duration_minutes: duration,
        status: 'scheduled',
        issue_context: issueContext,
        notes: '',
        created_at: now,
        updated_at: now
      }])
      .select('*')
      .single();

    if (bookingError) throw bookingError;

    const patient = await getUserById(patientId);
    const doctorEmailUser = doctor.userId ? await getUserById(doctor.userId) : null;
    const bookingTimeLabel = new Date(normalizedSlot).toUTCString();
    
    sendConsultationSms(
      patient?.phone || '',
      `Ayustura booking confirmed: ${bookingTimeLabel}, ${mode} consultation with ${doctor.name}.`
    ).catch(() => undefined);

    io.emit('consultation-booking-updated', {
      doctorId,
      mode,
      scheduledTime: normalizedSlot,
      updatedAt: now
    });

    await logHealthTimelineEvent(patientId, {
      eventType: 'consultation_booked',
      title: 'Consultation booked',
      details: `${doctor.name} | ${mode.toUpperCase()} | ${new Date(normalizedSlot).toLocaleString()}`,
      metadata: {
        bookingId: record.id,
        doctorId,
        doctorName: doctor.name,
        mode,
        scheduledTime: normalizedSlot,
        issueContext
      },
      occurredAt: now
    });

    return res.status(201).json({
      booking: {
        id: record.id,
        patientId: record.patient_id,
        doctorId: record.doctor_id,
        mode: record.mode,
        scheduledTime: record.scheduled_time,
        duration: record.duration_minutes,
        status: record.status,
        issueContext: record.issue_context,
        notes: record.notes,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      },
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialization: doctor.specialization.split(',').map((x) => x.trim()).filter(Boolean),
        experienceYears: doctor.experienceYears,
        languages: doctor.languages
      },
      nextSteps: ['Join from dashboard at scheduled time', 'You will receive reminders by email/SMS if configured']
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to confirm booking right now.' });
  }
});

app.get('/api/consultation/my-bookings', authRequired, async (req, res) => {
  const userId = String(req.user?.id || '');
  const role = normalizeRole(req.user.user_metadata?.role);
  if (!userId || !role) return res.status(401).json({ error: 'Unauthorized.' });

  const rawBookings = await getUserBookings(userId, role);
  const bookings = await Promise.all(rawBookings.map(async (booking) => {
    const doctor = await getDoctorProfileById(booking.doctorId);
    const patient = await getUserById(booking.patientId);
    return {
      ...booking,
      doctorName: doctor?.name || 'Doctor',
      doctorSpecialization: doctor?.specialization || 'General Ayurveda',
      patientName: patient?.name || 'Patient'
    };
  }));
  const now = Date.now();
  const upcoming = bookings.filter((booking) => booking.status === 'scheduled' && new Date(booking.scheduledTime).getTime() >= now);
  const past = bookings.filter((booking) => booking.status !== 'scheduled' || new Date(booking.scheduledTime).getTime() < now);
  return res.json({ bookings, upcoming, past });
});

app.get('/api/consultation/continuity', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
    const limit = Math.max(1, Math.min(20, Number(req.query.limit || 8)));
    const continuity = await getContinuityForPatient(userId, limit);
    return res.json({ continuity });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to load continuity data.' });
  }
});

app.get('/api/consultation/patient-brief', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'doctor') return res.status(403).json({ error: 'Doctor account required.' });

    const profile = await fetchDoctorProfileForUser(userId);
    if (!profile) return res.status(404).json({ error: 'Doctor profile missing.' });
    const doctorId = String(req.query.doctorId || profile.id || '').trim();
    const patientId = String(req.query.patientId || '').trim();
    if (!patientId) return res.status(400).json({ error: 'patientId is required.' });
    if (doctorId !== profile.id) return res.status(403).json({ error: 'Access denied for doctor context.' });

    const { data: relation } = await supabase
      .from('consultation_bookings')
      .select('id')
      .eq('doctor_id', String(doctorId || ''))
      .eq('patient_id', String(patientId || ''))
      .limit(1)
      .maybeSingle();

    if (!relation) return res.status(403).json({ error: 'No consultation relationship found for this patient.' });

    const patient = await getUserById(patientId);
    
    const { data: recentBookingsData } = await supabase
      .from('consultation_bookings')
      .select('id, mode, status, scheduled_time, duration_minutes, issue_context, notes')
      .eq('doctor_id', String(doctorId || ''))
      .eq('patient_id', String(patientId || ''))
      .order('scheduled_time', { ascending: false })
      .limit(10);

    const recentBookings = (recentBookingsData || []).map(item => ({
      id: item.id,
      mode: item.mode,
      status: item.status,
      scheduledTime: item.scheduled_time,
      duration: item.duration_minutes,
      issueContext: item.issue_context,
      notes: item.notes
    }));

    const latestDosha = await listDoshaAssessmentsForUser(patientId, 3);
    const recentSymptoms = (await listRecentSymptomLogs(patientId, 14, 24)).slice(0, 10);
    
    const { data: lastPrescription } = await supabase
      .from('consultation_bookings')
      .select('id, notes, scheduled_time')
      .eq('doctor_id', String(doctorId || ''))
      .eq('patient_id', String(patientId || ''))
      .not('notes', 'is', null)
      .neq('notes', '')
      .order('scheduled_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    const profileSnapshot = await getPatientProfileSnapshotFromState(patientId);

    return res.json({
      patient: {
        id: String(patient?.id || patientId),
        name: String(patient?.name || 'Patient'),
        phone: String(patient?.phone || ''),
        email: String(patient?.email || ''),
        age: profileSnapshot?.age || null,
        gender: profileSnapshot?.gender || null,
        location: profileSnapshot?.location || null
      },
      continuity: {
        totalConsultations: recentBookings.length,
        lastConsultationAt: recentBookings[0]?.scheduledTime || null,
        recentIssues: recentBookings
          .map((item) => String(item.issueContext || '').trim())
          .filter(Boolean)
          .slice(0, 5),
        recentSymptoms: recentSymptoms.map((item) => ({
          symptom: item.symptom,
          severity: item.severity,
          loggedForDate: item.loggedForDate,
          note: item.note
        })),
        medicationSnapshot: profileSnapshot?.medications || [],
        allergies: profileSnapshot?.allergies || [],
        lastDoctorNote: lastPrescription?.notes ? String(lastPrescription.notes).slice(0, 240) : ''
      },
      dosha: latestDosha[0] || null,
      history: recentBookings
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to load patient brief.' });
  }
});

app.get('/api/symptoms/daily', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
    const days = Math.max(1, Math.min(30, Number(req.query.days || 14)));
    const logs = await listRecentSymptomLogs(userId, days, 80);
    const today = nowIso().slice(0, 10);
    const todayLogs = logs.filter((item) => String(item.loggedForDate || '') === today).slice(0, 12);
    return res.json({ today: todayLogs, recent: logs });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to load symptom logs.' });
  }
});

app.post('/api/symptoms/daily', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
    const entry = await upsertDailySymptomLog(userId, {
      symptom: req.body?.symptom,
      severity: req.body?.severity,
      note: req.body?.note,
      loggedForDate: req.body?.loggedForDate
    });
    await logHealthTimelineEvent(userId, {
      eventType: 'symptom_logged',
      title: 'Daily symptom logged',
      details: `${sanitizeSymptomText(entry.symptom || '', 80)} (${normalizeSymptomSeverity(entry.severity || 'Medium')})`,
      metadata: {
        symptom: sanitizeSymptomText(entry.symptom || '', 80),
        severity: normalizeSymptomSeverity(entry.severity || 'Medium'),
        note: sanitizeSymptomText(entry.note || '', 220),
        loggedForDate: String(entry.loggedForDate || '')
      },
      occurredAt: String(entry.updatedAt || nowIso())
    });
    return res.status(201).json({
      entry: {
        id: String(entry.id || ''),
        symptom: sanitizeSymptomText(entry.symptom || '', 80),
        severity: normalizeSymptomSeverity(entry.severity || 'Medium'),
        note: sanitizeSymptomText(entry.note || '', 220),
        loggedForDate: String(entry.loggedForDate || ''),
        createdAt: String(entry.createdAt || ''),
        updatedAt: String(entry.updatedAt || '')
      }
    });
  } catch (err) {
    if (String(err?.message || '') === 'invalid_symptom') {
      return res.status(400).json({ error: 'symptom is required and must be at least 2 characters.' });
    }
    if (String(err?.message || '') === 'invalid_user') {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    return res.status(500).json({ error: err?.message || 'Unable to log symptom.' });
  }
});

app.patch('/api/consultation/bookings/:bookingId/cancel', authRequired, async (req, res) => {
  try {
    const bookingId = String(req.params.bookingId || '').trim();
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    const reason = String(req.body?.reason || '').trim().slice(0, 220);
    if (!bookingId) return res.status(400).json({ error: 'bookingId is required.' });
    if (!userId || !role) return res.status(401).json({ error: 'Unauthorized.' });

    const { data: booking, error: fetchError } = await supabase
      .from('consultation_bookings')
      .select('id, patient_id, doctor_id, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchError || !booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.status !== 'scheduled') return res.status(400).json({ error: 'Only scheduled bookings can be cancelled.' });

    let allowed = false;
    if (role === 'patient' && booking.patient_id === userId) allowed = true;
    if (role === 'doctor') {
      const profile = await fetchDoctorProfileForUser(userId);
      if (profile && profile.id === booking.doctor_id) allowed = true;
    }
    if (!allowed) return res.status(403).json({ error: 'Access denied.' });

    const now = nowIso();
    const { error: updateError } = await supabase
      .from('consultation_bookings')
      .update({
        status: 'cancelled',
        cancelled_by: userId,
        cancelled_reason: reason || 'Cancelled by user',
        updated_at: now
      })
      .eq('id', bookingId);

    if (updateError) throw updateError;

    await logHealthTimelineEvent(String(booking.patient_id || ''), {
      eventType: 'consultation_cancelled',
      title: 'Consultation cancelled',
      details: reason || 'Cancelled by user',
      metadata: {
        bookingId,
        doctorId: booking.doctor_id,
        cancelledBy: userId
      },
      occurredAt: now
    });

    io.emit('consultation-booking-updated', {
      doctorId: booking.doctor_id,
      updatedAt: now
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to cancel booking.' });
  }
});

app.put('/api/consultation/doctor/availability', authRequired, async (req, res) => {
  try {
    const role = normalizeRole(req.user.user_metadata?.role);
    const userId = String(req.user?.id || '');
    if (role !== 'doctor' || !userId) return res.status(403).json({ error: 'Doctor account required.' });
    const profile = await fetchDoctorProfileForUser(userId);
    if (!profile) return res.status(404).json({ error: 'Doctor profile missing.' });

    const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];

    // Individual steps for Supabase
    const { error: deleteRulesError } = await supabase
      .from('doctor_availability_rules')
      .delete()
      .eq('doctor_id', profile.id);
    if (deleteRulesError) throw deleteRulesError;

    const now = nowIso();
    const formattedRules = rules.map(rule => {
      const weekday = Number(rule.weekday);
      const startMinute = Number(rule.startMinute);
      const endMinute = Number(rule.endMinute);
      const modes = Array.isArray(rule.modes) ? rule.modes.filter((m) => ['chat', 'audio', 'video'].includes(m)) : ['chat'];
      if (weekday >= 0 && weekday <= 6 && startMinute >= 0 && startMinute < 1440 && endMinute > startMinute && endMinute <= 1440) {
        return {
          doctor_id: profile.id,
          weekday,
          start_minute: startMinute,
          end_minute: endMinute,
          modes_json: modes.length ? modes : ['chat'],
          is_active: true,
          created_at: now,
          updated_at: now
        };
      }
      return null;
    }).filter(Boolean);

    if (formattedRules.length) {
      const { error: insertRulesError } = await supabase
        .from('doctor_availability_rules')
        .insert(formattedRules);
      if (insertRulesError) throw insertRulesError;
    }

    const { error: deleteBlocksError } = await supabase
      .from('doctor_unavailable_blocks')
      .delete()
      .eq('doctor_id', profile.id);
    if (deleteBlocksError) throw deleteBlocksError;

    const formattedBlocks = blocks.map(block => {
      const startAt = String(block.startAt || '').trim();
      const endAt = String(block.endAt || '').trim();
      if (startAt && endAt && new Date(startAt).getTime() < new Date(endAt).getTime()) {
        return {
          doctor_id: profile.id,
          start_at: startAt,
          end_at: endAt,
          reason: String(block.reason || 'Unavailable').slice(0, 120),
          created_at: now
        };
      }
      return null;
    }).filter(Boolean);

    if (formattedBlocks.length) {
      const { error: insertBlocksError } = await supabase
        .from('doctor_unavailable_blocks')
        .insert(formattedBlocks);
      if (insertBlocksError) throw insertBlocksError;
    }

    io.emit('consultation-booking-updated', { doctorId: profile.id, updatedAt: nowIso() });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to update availability.' });
  }
});

app.get('/api/guidance', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
    const force = String(req.query.force || '').trim() === '1';
    const result = await createGuidanceForUser(userId, force);
    return res.json({
      generatedAt: result.generatedAt,
      contextVersion: result.contextHash,
      fromCache: result.fromCache,
      advisory: 'Supportive wellness guidance only. For severe symptoms, consult a doctor immediately.',
      items: result.items
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to load guidance right now.' });
  }
});

app.post('/api/guidance/refresh', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
    const result = await createGuidanceForUser(userId, true);
    return res.json({
      generatedAt: result.generatedAt,
      contextVersion: result.contextHash,
      fromCache: result.fromCache,
      advisory: 'Supportive wellness guidance only. For severe symptoms, consult a doctor immediately.',
      items: result.items
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to refresh guidance right now.' });
  }
});

app.post('/api/guidance/feedback', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || role !== 'patient') return res.status(403).json({ error: 'Patient account required.' });
    const guidanceId = String(req.body?.guidanceId || '').trim();
    const feedbackType = String(req.body?.feedbackType || '').trim();
    const allowed = new Set(['helpful', 'ignored', 'saved', 'dismissed']);
    if (!guidanceId) return res.status(400).json({ error: 'guidanceId is required.' });
    if (!allowed.has(feedbackType)) return res.status(400).json({ error: 'Unsupported feedback type.' });
    
    await setGuidanceFeedback(userId, guidanceId, feedbackType);
    
    if (feedbackType === 'helpful' || feedbackType === 'saved') {
      await logHealthTimelineEvent(userId, {
        eventType: 'guidance_feedback',
        title: feedbackType === 'saved' ? 'Guidance saved' : 'Guidance marked helpful',
        details: `Feedback: ${feedbackType}`,
        metadata: { guidanceId, feedbackType },
        occurredAt: nowIso()
      });
    }
    return res.json({ success: true });
  } catch (err) {
    if (String(err?.message || '') === 'guidance_not_found') {
      return res.status(404).json({ error: 'Guidance item not found.' });
    }
    if (String(err?.message || '') === 'guidance_forbidden') {
      return res.status(403).json({ error: 'You cannot update this guidance item.' });
    }
    return res.status(500).json({ error: err?.message || 'Unable to save feedback.' });
  }
});

app.get('/api/timeline', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || !role) return res.status(401).json({ error: 'Unauthorized.' });
    const limit = Math.max(10, Math.min(200, Number(req.query.limit || 80)));
    const events = await listHealthTimelineEvents(userId, limit);
    return res.json({ events });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to load health timeline.' });
  }
});

app.post('/api/timeline/event', authRequired, async (req, res) => {
  try {
    const userId = String(req.user?.id || '');
    const role = normalizeRole(req.user.user_metadata?.role);
    if (!userId || !role) return res.status(401).json({ error: 'Unauthorized.' });
    const eventType = sanitizeTimelineText(req.body?.eventType || 'health_event', 48) || 'health_event';
    const title = sanitizeTimelineText(req.body?.title || '', 120);
    const details = sanitizeTimelineText(req.body?.details || '', 260);
    const occurredAt = String(req.body?.occurredAt || '').trim();
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
      ? req.body.metadata
      : {};
    if (!title) return res.status(400).json({ error: 'title is required.' });
    const event = await logHealthTimelineEvent(userId, { eventType, title, details, metadata, occurredAt });
    return res.status(201).json({ event });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unable to save timeline event.' });
  }
});

app.get('/api/medicine/search', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!canProceedRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please retry in a minute.' });
  }
  const q = sanitizeQuery(req.query.q);
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters.' });
  }

  const cacheKey = q.toLowerCase();
  const cacheEntry = medicineCache.get(cacheKey);
  if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
    return res.json({ query: q, data: [cacheEntry.value], cached: true });
  }

  try {
    const info = await resolveMedicineInfo(q);
    if (!info) {
      return res.status(404).json({
        query: q,
        data: [],
        error: 'No verified data available'
      });
    }
    medicineCache.set(cacheKey, { value: info, expiresAt: Date.now() + 60 * 60 * 1000 });
    medicineDetailCache.set(info.id, info);
    return res.json({ query: q, data: [info], cached: false });
  } catch (err) {
    return res.status(502).json({
      query: q,
      data: [],
      error: `Upstream source error: ${err?.message || 'Unknown error'}`
    });
  }
});

app.get('/api/medicine/detail/:id', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!canProceedRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please retry in a minute.' });
  }
  const id = sanitizeQuery(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid medicine id.' });
  const cached = medicineDetailCache.get(id.toLowerCase());
  if (cached) return res.json({ data: cached, cached: true });

  const info = await resolveMedicineInfo(id);
  if (!info) return res.status(404).json({ error: 'No verified data available' });
  medicineDetailCache.set(id.toLowerCase(), info);
  return res.json({ data: info, cached: false });
});

app.post('/api/sessions/create', async (req, res) => {
  const { patientId, doctorId, requesterId, requesterRole, linkedAssessmentId = '', initiationType = 'instant' } = req.body || {};
  if (!patientId || !doctorId || !requesterId) {
    return res.status(400).json({ error: 'patientId, doctorId, requesterId are required.' });
  }
  const role = normalizeRole(requesterRole);
  if (!role) return res.status(400).json({ error: 'requesterRole must be patient or doctor.' });
  if (requesterId !== patientId && requesterId !== doctorId) {
    return res.status(403).json({ error: 'Requester must be patient or doctor in this session.' });
  }
  if (initiationType !== 'instant' && initiationType !== 'appointment') {
    return res.status(400).json({ error: 'initiationType must be instant or appointment.' });
  }

  // Enforce 15-minute early access rule for scheduled appointments
  if (initiationType === 'appointment' && linkedAssessmentId) {
    try {
      const { data: booking } = await supabase
        .from('consultation_bookings')
        .select('scheduled_time')
        .eq('id', linkedAssessmentId)
        .maybeSingle();

      if (booking && booking.scheduled_time) {
        const scheduledTime = new Date(booking.scheduled_time).getTime();
        const nowTime = Date.now();
        const minutesUntil = (scheduledTime - nowTime) / (1000 * 60);
        
        if (minutesUntil > 15) {
          return res.status(403).json({ 
            error: `You can only join the consultation room 15 minutes before the scheduled time. Please wait ${Math.ceil(minutesUntil - 15)} more minutes.`
          });
        }
      }
    } catch (e) {
      console.error('Error verifying appointment time:', e);
    }
  }

  const sessionId = buildSessionId();
  
  let dbMessages = [];
  try {
    const { data: messages } = await supabase
      .from('consultation_messages')
      .select('id, sender_role:sender_id, text, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    
    dbMessages = (messages || []).map(m => ({
      id: m.id,
      sender: m.sender_role,
      text: m.text,
      createdAt: m.created_at
    }));
  } catch(e) {}

  const session = {
    sessionId,
    patientId,
    doctorId,
    linkedAssessmentId,
    initiationType,
    status: 'active',
    activeMode: 'chat',
    modeUsed: ['chat'],
    startTime: nowIso(),
    endTime: null,
    startedAt: nowIso(),
    endedAt: null,
    lastActivityAt: Date.now(),
    participantsOnline: { patient: false, doctor: false },
    messages: dbMessages || [],
    attachments: []
  };
  sessions.set(sessionId, session);
  return res.json(session);
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const userId = String(req.query.userId || '');
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!userId || !isParticipant(session, userId)) return res.status(403).json({ error: 'Access denied.' });
  return res.json(session);
});

app.post('/api/sessions/:sessionId/end', (req, res) => {
  const { sessionId } = req.params;
  const userId = String(req.body?.userId || '');
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!userId || !isParticipant(session, userId)) {
    return res.status(403).json({ error: 'Only patient or doctor can end session.' });
  }
  if (session.status !== 'active') return res.json(session);

  session.status = 'completed';
  session.activeMode = 'chat';
  session.endedAt = nowIso();
  session.endTime = session.endedAt;
  session.lastActivityAt = Date.now();
  session.messages.push({
    id: `msg_${Date.now()}_system_end`,
    sender: 'system',
    text: `Consultation ended by ${userId}.`,
    createdAt: nowIso()
  });
  // Realtime updates handled via Supabase
  emitSessionState(sessionId);
  return res.json(session);
});

// Socket.IO handlers removed - migrated to Supabase Realtime (Broadcast/Presence)

setInterval(() => {
  cleanupExpiredAuthData();
  cleanupExpiredGuidance();
}, 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.status !== 'active') continue;
    if (now - session.lastActivityAt < 30 * 60 * 1000) continue;
    session.status = 'completed';
    session.activeMode = 'chat';
    session.endedAt = nowIso();
    session.endTime = session.endedAt;
    session.messages.push({
      id: `msg_${Date.now()}_timeout`,
      sender: 'system',
      text: 'Session auto-ended due to inactivity timeout.',
      createdAt: nowIso()
    });
    // Realtime updates handled via Supabase
    emitSessionState(session.sessionId);
  }
}, 15000);

// --- PRESCRIPTION GENERATOR REST ROUTES ---
const { generatePrescriptionPdf } = require('./utils/pdfGenerator');

// MongoDB logic removed - completely migrated to Supabase.
// SQLite fallback logic removed - completely migrated to Supabase.

// REST endpoint to create a prescription
app.post('/api/prescriptions', async (req, res) => {
  try {
    const data = req.body;
    const now = new Date();
    
    // Save to Supabase
    const { data: record, error } = await supabase
      .from('prescriptions')
      .insert([{
        appointment_id: data.consultationId,
        doctor_id: data.doctorId,
        patient_id: data.patientId,
        patient_details: data.patientDetails || { name: 'Unknown' },
        diagnosis: data.diagnosis,
        symptoms: data.symptoms,
        medicines: data.medicines || [],
        diet_recommendation: data.dietRecommendation,
        lifestyle_advice: data.lifestyleAdvice,
        doctor_notes: data.doctorNotes,
        created_at: now,
        updated_at: now
      }])
      .select('*')
      .single();
    
    if (error) throw error;
    
    // Generate PDF
    const safeId = record.id;
    const fileName = `prescription_${safeId}.pdf`;
    const pdfPath = path.join(__dirname, 'secure_uploads', 'prescriptions', fileName);
    
    const doctorDetails = {
      name: data.doctorName || 'Ayusutra Doctor',
      specialization: data.doctorSpecialization || 'Ayurvedic Medicine',
      registration: data.doctorRegistration || 'AYU-1002'
    };
    
    await generatePrescriptionPdf(record, doctorDetails, pdfPath);
    
    // Update PDF URL in Supabase
    const pdfUrl = `/api/prescriptions/${safeId}/download`;
    await supabase.from('prescriptions').update({ pdf_url: pdfUrl }).eq('id', safeId);
    
    res.status(201).json({ success: true, prescription: { ...record, pdf_url: pdfUrl } });
  } catch (error) {
    console.error('Error creating prescription:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// REST endpoint to get prescriptions by patient ID
app.get('/api/prescriptions/patient/:patientId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', req.params.patientId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    res.json({ success: true, prescriptions: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// REST endpoint to serve prescription PDF
app.get('/api/prescriptions/:id/download', async (req, res) => {
  try {
    const { data: prescription, error } = await supabase
      .from('prescriptions')
      .select('id, pdf_url')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error || !prescription || !prescription.pdf_url) {
      return res.status(404).json({ success: false, error: 'Prescription PDF not found' });
    }
    
    const safeId = prescription.id;
    const fileName = `prescription_${safeId}.pdf`;
    const pdfPath = path.join(__dirname, 'secure_uploads', 'prescriptions', fileName);
    
    if (fs.existsSync(pdfPath)) {
      res.download(pdfPath, fileName);
    } else {
      res.status(404).json({ success: false, error: 'File missing on server' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- HERB ENCYCLOPEDIA ENDPOINTS --- //

// 1. Herbal Suggestions / Autocomplete
app.get('/api/herbs/suggestions', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json({ success: true, suggestions: [] });

    // Supabase ilike search
    const { data, error } = await supabase
      .from('herbs')
      .select('herb_name:name, scientific_name, image_url, other_names:hindi_name')
      .or(`name.ilike.${q}%,scientific_name.ilike.${q}%,hindi_name.ilike.%${q}%`)
      .limit(8);

    if (error) throw error;
    res.json({ success: true, suggestions: data });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch suggestions' });
  }
});

// 2. Comprehensive Herb Search (Full Text Search)
app.get('/api/herbs/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) return res.json({ success: true, results: [] });

    // Supabase text search or multiple ilike
    const { data, error } = await supabase
      .from('herbs')
      .select('*, herb_name:name, other_names:hindi_name')
      .or(`name.ilike.%${q}%,scientific_name.ilike.%${q}%,hindi_name.ilike.%${q}%,uses.cs.{${q}},benefits.ilike.%${q}%`)
      .limit(20);

    if (error) throw error;
    res.json({ success: true, results: data });
  } catch (error) {
    console.error('Error searching herbs detailed:', error);
    res.status(500).json({ success: false, error: 'Failed to search herbs', details: error.message });
  }
});

// 3. Get Detailed Herb Info (or Cache Miss -> AI Synthesize)
app.get('/api/herbs/:herbName', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.herbName);
    
    // Check Supabase "Cache" (Main Storage)
    const { data: herb, error } = await supabase
      .from('herbs')
      .select('*, herb_name:name, other_names:hindi_name')
      .or(`name.ilike.${name},scientific_name.ilike.${name}`)
      .maybeSingle();

    if (herb) return res.json({ success: true, data: herb, source: 'supabase' });

    // --- CACHE MISS: Synthesize Herb Data from OpenAI & Wikipedia --- //
    // 1. Fetch from Wikipedia for basic summary and image
    let wikiImageUrl = null;
    try {
      const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        if (wikiData.thumbnail && wikiData.thumbnail.source) {
          wikiImageUrl = wikiData.thumbnail.source;
        }
      }
    } catch (wikiErr) {
      console.log('Wikipedia fetch failed (ignoring)', wikiErr.message);
    }

    let jsonStr;
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
       console.log('OpenAI API Key missing, generating mock Ayurvedic data for encyclopedia testing.');
       const mockJson = {
         herb_name: name.charAt(0).toUpperCase() + name.slice(1),
         scientific_name: 'Botanicus exemplaria',
         other_names: `${name}(English), ${name}a(Sanskrit), ${name}i(Hindi)`,
         family: 'Lamiaceae',
         description: `This is a highly revered medicinal plant in the traditional Indian system of Ayurveda. ${name} represents a cornerstone of holisitic herbal treatments, known for its balancing properties.`,
         parts_used: 'Leaves, Root, Seeds',
         ayurvedic_uses: 'Balances Vata and Kapha doshas. Known for its Ushan (heating) virya and Madhura (sweet) vipaka. It acts as a Rasayana (rejuvenator).',
         modern_uses: 'Modern studies indicate potential adaptogenic, anti-inflammatory, and neuroprotective properties.',
         diseases_treated: 'Stress, Fatigue, Immunity, Digestive issues, Respiratory ailments.',
         benefits: 'Significantly improves natural immunity, reduces psychological stress and anxiety, enhances vitality, and supports a healthy inflammatory response in the body.',
         preparation_methods: 'Decoction (Kashayam), Powder (Churna) with warm milk, or infused oil.',
         recommended_dosage: '2-5 grams of powder twice daily with warm water or milk.',
         safe_consumption_limits: 'Safe for daily use up to 3 months. Consult practitioner for longer periods.',
         precautions: 'Use with caution if suffering from severe Pitta imbalance or acute inflammatory conditions.',
         pregnancy_warnings: 'Consult a qualified Ayurvedic doctor before consumption during pregnancy.',
         drug_interactions: 'May potentiate sedatives or interact with immunosuppressants. Consult physician.',
         research_summary: 'Numerous clinical trials highlight its efficacy as a powerful adaptogen and immunomodulator, though more large-scale human studies are ongoing.',
         related_herbs: ['Tulsi', 'Ashwagandha', 'Brahmi', 'Shatavari'],
         compounds: [
           { name: 'Active Alkaloids', description: 'Provides the primary therapeutic and neuroprotective effects.' },
           { name: 'Flavonoids', description: 'Acts as potent antioxidants reducing cellular stress.' },
           { name: 'Saponins', description: 'Supports immune function and reduces inflammation.' }
         ]
       };
       jsonStr = JSON.stringify(mockJson);
    } else {
      const prompt = `You are an expert Ayurvedic Doctor and Botanist. Please provide highly structured encyclopedic data about the medicinal herb: "${name}". 
Return ONLY a valid JSON object with the exact keys below. If a field is unknown, use "Not comprehensively recorded". Do NOT wrap the JSON in markdown blocks (no \`\`\`json).
{
  "herb_name": "Standardized primary name (e.g., Ashwagandha)",
  "scientific_name": "e.g., Withania somnifera",
  "other_names": "Hindi, Sanskrit, Regional names",
  "family": "Plant family",
  "description": "Botanical description",
  "parts_used": "e.g., Root, Leaves",
  "ayurvedic_uses": "Detailed Ayurvedic context (Doshas balanced, Rasa, Virya)",
  "modern_uses": "Modern pharmacological uses",
  "diseases_treated": "List of diseases/conditions",
  "benefits": "Key health benefits (immunity, stress, etc.)",
  "preparation_methods": "How it is commonly prepared (powder, decoction, oil)",
  "recommended_dosage": "Standard safe dosage",
  "safe_consumption_limits": "Maximum safe limits/duration",
  "precautions": "General precautions",
  "pregnancy_warnings": "Is it safe during pregnancy?",
  "drug_interactions": "Known modern drug interactions",
  "research_summary": "Summary of modern scientific backing",
  "related_herbs": ["Array", "of", "similar", "herbs"],
  "compounds": [
    { "name": "Compound name", "description": "What it does" }
  ]
}`;
      
      const axios = require('axios');
      const openAiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: [{ role: 'system', content: prompt }],
          temperature: 0.2
        },
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      jsonStr = openAiResponse.data.choices[0].message.content.trim();
    }

    let herbData;
    try {
      herbData = JSON.parse(jsonStr);
    } catch(err) {
      const cleaned = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      herbData = JSON.parse(cleaned);
    }

    herbData.image_url = wikiImageUrl;
    herbData.status = 'verified';
    herbData.source_info = 'AI Synthesized + Wikipedia';
    
    // Save to Supabase (Cache)
    const { error: insertError } = await supabase
      .from('herbs')
      .insert([herbData]);
    
    if (insertError) {
      console.error('Failed to save synthesized herb to Supabase:', insertError);
    }

    res.json({ success: true, data: herbData, source: 'synthesized' });

  } catch (error) {
    console.error('Error fetching/synthesizing herb detailed:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve or synthesize herb knowledge.', details: error.message, stack: error.stack });
  }
});

// ═══════════════════════════════════════════════════════
// AI SERVICE ROUTE
// ═══════════════════════════════════════════════════════
const { getAIResponse } = require('./services/ai.service');

app.post(['/api/ai/ask', '/ai/ask'], async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required.' });

    const aiResult = await getAIResponse(query);
    res.json(aiResult);
  } catch (err) {
    console.error('AI ask error:', err);
    res.status(500).json({ error: 'Failed to retrieve AI response', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// ENCYCLOPEDIA ROUTES
// ═══════════════════════════════════════════════════════
const { searchEncyclopedia, getEntry } = require('./services/encyclopedia.service');

app.get(['/api/encyclopedia', '/encyclopedia'], async (req, res) => {
  try {
    const q = req.query.q || '';
    const result = await searchEncyclopedia(q);
    res.json(result);
  } catch (err) {
    console.error('Encyclopedia search error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/encyclopedia/:id', '/encyclopedia/:id'], async (req, res) => {
  try {
    const entry = await getEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry });
  } catch (err) {
    console.error('Encyclopedia get entry error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// UNIVERSAL SEARCH ENDPOINT
// ═══════════════════════════════════════════════════════
app.get(['/api/search', '/search'], async (req, res) => {
  try {
    const q = req.query.q || '';
    const type = req.query.type || 'all';

    if (!q.trim()) {
      return res.json({ herbs: [], medicines: [], encyclopedia: [], wikipedia: [] });
    }

    const results = {};
    const searches = [];

    if (type === 'all' || type === 'herbs') {
      searches.push(
        supabase
          .from('herbs')
          .select('id,name,scientific_name,hindi_name,description,benefits,category,image_url')
          .or(
            `name.ilike.%${q}%,scientific_name.ilike.%${q}%,hindi_name.ilike.%${q}%,description.ilike.%${q}%`
          )
          .limit(8)
          .then(({ data }) => { results.herbs = data || []; })
      );
    }

    if (type === 'all' || type === 'medicines') {
      searches.push(
        supabase
          .from('medicines')
          .select('id,name,type,form,description,benefits,category,image_url')
          .or(`name.ilike.%${q}%,description.ilike.%${q}%,type.ilike.%${q}%`)
          .limit(8)
          .then(({ data }) => { results.medicines = data || []; })
      );
    }

    if (type === 'all' || type === 'encyclopedia') {
      searches.push(
        supabase
          .from('encyclopedia')
          .select('id,title,content')
          .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
          .limit(6)
          .then(({ data }) => { results.encyclopedia = data || []; })
      );
    }

    await Promise.allSettled(searches);

    // Ensure all keys exist
    results.herbs = results.herbs || [];
    results.medicines = results.medicines || [];
    results.encyclopedia = results.encyclopedia || [];

    const totalLocal =
      results.herbs.length + results.medicines.length + results.encyclopedia.length;

    if (totalLocal < 3) {
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
            q + ' ayurveda'
          )}&format=json&origin=*&srlimit=5`
        );
        const wikiData = await wikiRes.json();
        results.wikipedia = (wikiData.query?.search || []).map((r) => ({
          id: `wiki_${r.pageid}`,
          name: r.title,
          description: r.snippet.replace(/<[^>]+>/g, ''),
          source: 'wikipedia',
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`
        }));
      } catch (e) {
        results.wikipedia = [];
      }
    } else {
      results.wikipedia = [];
    }

    res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════
// AI HEALTH ASSISTANT ENDPOINT (free fallback)
// ═══════════════════════════════════════════════════════

app.post(['/api/ai/chat', '/ai/chat'], async (req, res) => {
  try {
    const { query, message } = req.body;
    const userQuery = String(query || message || '').trim();
    if (!userQuery) {
      return res.status(400).json({ error: 'Query is required' });
    }
    const result = await getAIResponse(userQuery);
    res.json(result);
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

server.listen(process.env.PORT || 4000, () => {
  console.log('Server running on port', process.env.PORT || 4000)
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port already in use. Kill the process using: npx kill-port 4000')
    process.exit(1)
  }
});
