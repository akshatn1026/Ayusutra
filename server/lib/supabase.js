const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Helper to load env in this specific file if needed
function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
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
}

if (!process.env['SUPABASE_URL']) {
  loadEnv();
}

function decodeJwtRole(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return '';
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded)?.role || '';
  } catch {
    return '';
  }
}

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Supabase configuration missing! Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabaseKeyRole = decodeJwtRole(supabaseServiceKey);
if (supabaseServiceKey && supabaseKeyRole && supabaseKeyRole !== 'service_role') {
  console.warn(
    `⚠️ SUPABASE_SERVICE_ROLE_KEY appears to be a ${supabaseKeyRole} key. Use the service_role key on the backend or admin routes will fail.`
  );
}

const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = { supabase };
