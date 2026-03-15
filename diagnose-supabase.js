const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.join(__dirname, 'server', '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    });
  }
}

async function testSupabase() {
  loadEnv();
  
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('--- Supabase Connectivity Check ---');
  console.log('URL:', url);
  console.log('Key Starts With:', key ? key.substring(0, 5) + '...' : 'MISSING');
  
  if (!url || !key || url.includes('your-project-id') || key.includes('your-service-role-key')) {
    console.error('❌ ERROR: You are still using placeholders in .env!');
    return;
  }

  if (key.startsWith('sb_publishable_')) {
    console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY looks like a Stripe key, not a Supabase key!');
    return;
  }

  const supabase = createClient(url, key);
  
  console.log('\nTesting connection to Supabase Auth...');
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error('❌ AUTH ERROR:', error.message);
    } else {
      console.log('✅ Auth Connection Successful! Found ' + data.users.length + ' users.');
    }
  } catch (err) {
    console.error('❌ CRITICAL ERROR:', err.message);
  }

  console.log('\nTesting connection to public.users table...');
  try {
    const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (error) {
       console.error('❌ DB ERROR:', error.message);
       if (error.message.includes('relation "public.users" does not exist')) {
         console.error('💡 TIP: You need to run the schema.sql in Supabase SQL Editor!');
       }
    } else {
      console.log('✅ DB Connection Successful! Found ' + (count || 0) + ' users in table.');
    }
  } catch (err) {
    console.error('❌ CRITICAL DB ERROR:', err.message);
  }
}

testSupabase();
