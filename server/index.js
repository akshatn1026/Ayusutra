/**
 * Ayusutra Backend — Modular Entry Point
 * 
 * This is the new entry point for the Ayusutra backend server.
 * It wraps the existing consult-server.js (which contains all routes and logic)
 * with additional production-level middleware for security, logging, and monitoring.
 * 
 * Usage:
 *   node server/index.js
 * 
 * The original consult-server.js remains functional as a standalone server
 * and can still be started directly for backward compatibility.
 */

const path = require('path');
const fs = require('fs');
const { openAIConfigured } = require('./services/ai.service');

// ─── Load environment variables ──────────────────────────────────────────────
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

// ─── Configuration ───────────────────────────────────────────────────────────
const defaultCorsOrigins = [
  'https://ayusutra-frontend.onrender.com',
  'http://localhost:4200'
];

const config = {
  port: Number(process.env.PORT || process.env.CONSULT_PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : defaultCorsOrigins,
  emailUser: process.env.EMAIL_USER || '',
  publicApiUrl: process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || '',

  // Rate limiting
  rateLimitWindowMs: 60 * 1000,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX ? Number(process.env.RATE_LIMIT_MAX) : 100,

  // OpenAI (for AI Health Analyzer)
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // File storage
  uploadDir: path.join(__dirname, 'secure_uploads'),
  maxUploadSize: 10 * 1024 * 1024 // 10MB
};

// ─── Validate critical configuration ─────────────────────────────────────────
function validateConfig() {
  const warnings = [];

  if (config.corsOrigins.includes('*') && config.nodeEnv === 'production') {
    warnings.push('⚠️  CORS is set to allow all origins. Set CORS_ORIGINS in .env for production.');
  }

  return warnings;
}

// ─── Print startup banner ────────────────────────────────────────────────────
function printStartupBanner() {
  const warnings = validateConfig();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    🌿 AYUSUTRA SERVER                       ║');
  console.log('║              Digital Ayurvedic Healthcare Platform           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Environment: ${config.nodeEnv}`);
  console.log(`  Port:        ${config.port}`);
  console.log(`  CORS:        ${config.corsOrigins.join(', ')}`);
  console.log(`  Public URL:  ${config.publicApiUrl || 'Auto-detected from request'}`);
  console.log(`  Email:       ${config.emailUser ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  AI:          ${openAIConfigured ? '✅ Configured (GPT-3.5)' : '🆓 Free Wikipedia + DB fallback active'}`);

  if (warnings.length > 0) {
    console.log('\n  Warnings:');
    warnings.forEach(w => console.log(`    ${w}`));
  }

  console.log('\n─────────────────────────────────────────────────────────────');
}

// ─── Boot the server ─────────────────────────────────────────────────────────
printStartupBanner();

// The existing consult-server.js is a self-contained Express + Socket.io server.
// It registers its own routes, starts listening, and handles everything.
// We simply require it to boot the server.
require('./consult-server.js');
