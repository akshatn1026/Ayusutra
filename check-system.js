const { supabase } = require('./server/lib/supabase');

async function check() {
  console.log('--- Environment Check ---');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_SERVICE_ROLE_KEY Length:', process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.length : 'MISSING');
  console.log('SUPABASE_SERVICE_ROLE_KEY Start:', process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10) + '...' : 'N/A');

  console.log('\n--- Supabase Connection Check ---');
  const { data: users, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
  if (error) {
    console.error('❌ Error accessing "users" table:', error.message);
    if (error.message.includes('relation "public.users" does not exist')) {
      console.error('💡 TIP: You MUST run the schema.sql in Supabase SQL Editor!');
    }
  } else {
    console.log('✅ Successfully reached "users" table.');
  }

  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('❌ Admin Auth Error:', authError.message);
    if (authError.message.includes('Invalid key') || authError.message.includes('not authorized')) {
      console.error('💡 TIP: Your SUPABASE_SERVICE_ROLE_KEY is invalid!');
    }
  } else {
    console.log('✅ Admin Auth Successful! Found ' + authUsers.users.length + ' users in Supabase Auth.');
  }
}

check();
