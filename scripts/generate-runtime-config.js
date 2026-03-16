const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

const isProdBuild = String(process.env.NODE_ENV || '').trim() === 'production';

const runtimeConfig = {
  apiUrl: trimTrailingSlash(
    process.env.FRONTEND_API_URL ||
      process.env.API_URL ||
      (isProdBuild ? 'https://ayusutra-backend.onrender.com' : 'http://localhost:4000')
  ),
  frontendUrl: trimTrailingSlash(
    process.env.FRONTEND_URL ||
      (isProdBuild ? 'https://ayusutra-frontend.onrender.com' : 'http://localhost:4200')
  ),
  supabaseUrl: trimTrailingSlash(
    process.env.FRONTEND_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      ''
  ),
  supabaseAnonKey: String(
    process.env.FRONTEND_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
  ).trim()
};

const outputPath = path.join(rootDir, 'src', 'assets', 'runtime-config.json');
fs.writeFileSync(outputPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`, 'utf8');

const missing = [];
if (!runtimeConfig.supabaseUrl) missing.push('FRONTEND_SUPABASE_URL or SUPABASE_URL');
if (!runtimeConfig.supabaseAnonKey) missing.push('FRONTEND_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY');

if (missing.length) {
  console.warn(`[runtime-config] Generated with missing values: ${missing.join(', ')}`);
} else {
  console.log(`[runtime-config] Wrote ${outputPath}`);
}
