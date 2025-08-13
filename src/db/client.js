import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - from file in development, from Render env in production
if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

// Verify configuration
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  if (!process.env.SUPABASE_URL) console.error('  - SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error('Current environment variables:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  process.exit(1);
}

// Initialize Supabase client with service role key for full access
// Add timeout and retry options for better network handling
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: undefined, // Let Supabase use its default fetch implementation
    },
    db: {
      schema: 'public'
    },
    // Add timeout for requests
    realtime: {
      timeout: 20000
    }
  }
);

console.log('✅ Supabase client initialized');
console.log(`   URL: ${process.env.SUPABASE_URL}`);
console.log(`   Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '***' + process.env.SUPABASE_SERVICE_ROLE_KEY.slice(-4) : 'NOT SET'}`);

// Test the connection
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase connection test failed:', error);
      return false;
    }
    
    console.log('✅ Supabase connection test successful');
    return true;
  } catch (err) {
    console.error('❌ Supabase connection test error:', err.message);
    return false;
  }
}

// Run connection test on initialization
testConnection();

export default supabase;