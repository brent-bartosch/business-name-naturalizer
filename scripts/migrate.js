#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');
  
  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '001_add_natural_names.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split into individual statements (simple split by semicolon)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const firstLine = statement.split('\n')[0].substring(0, 50);
      
      console.log(`[${i + 1}/${statements.length}] Executing: ${firstLine}...`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql: statement
      });
      
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        
        // Check if it's a "already exists" error
        if (error.message.includes('already exists')) {
          console.log('⚠️  Skipping (already exists)');
        } else {
          throw error;
        }
      } else {
        console.log('✅ Success');
      }
    }
    
    console.log('\n✨ Migrations completed successfully!');
    
    // Verify the changes
    console.log('\n📊 Verifying migration results...');
    
    // Check if natural_name column exists
    const { data: columns } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'outbound_email_targets' 
        AND column_name = 'natural_name'
      `
    });
    
    if (columns && columns.length > 0) {
      console.log('✅ natural_name column exists in outbound_email_targets');
    }
    
    // Check if cache table exists
    const { data: tables } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'business_name_naturalizations'
      `
    });
    
    if (tables && tables.length > 0) {
      console.log('✅ business_name_naturalizations table exists');
    }
    
    // Check if view exists
    const { data: views } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_name = 'pending_naturalizations'
      `
    });
    
    if (views && views.length > 0) {
      console.log('✅ pending_naturalizations view exists');
    }
    
    // Get stats
    const { data: stats } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          (SELECT COUNT(*) FROM outbound_email_targets) as total_targets,
          (SELECT COUNT(*) FROM outbound_email_targets WHERE natural_name IS NOT NULL) as naturalized,
          (SELECT COUNT(*) FROM outbound_email_targets WHERE natural_name IS NULL AND google_name IS NOT NULL) as pending
      `
    });
    
    if (stats && stats.length > 0) {
      const s = stats[0];
      console.log('\n📈 Current statistics:');
      console.log(`   Total targets: ${s.total_targets}`);
      console.log(`   Already naturalized: ${s.naturalized}`);
      console.log(`   Pending naturalization: ${s.pending}`);
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migrations
runMigrations();