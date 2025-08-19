#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
  console.log('🎯 BOUTIQUE PROCESSING STATUS');
  console.log('================================\n');

  // Priority boutiques (with email and city)
  const { count: priorityTotal } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .eq('primary_category', 'Boutique')
    .not('reference_city', 'is', null)
    .not('best_email', 'is', null);

  const { count: priorityProcessed } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .eq('primary_category', 'Boutique')
    .not('reference_city', 'is', null)
    .not('best_email', 'is', null)
    .not('natural_name', 'is', null);

  const priorityPending = priorityTotal - priorityProcessed;
  const priorityPercent = Math.round((priorityProcessed / priorityTotal) * 100);

  console.log('📧 PRIORITY (with email & city):');
  console.log(`   Total: ${priorityTotal}`);
  console.log(`   ✅ Processed: ${priorityProcessed}`);
  console.log(`   ⏳ Pending: ${priorityPending}`);
  console.log(`   Progress: ${priorityPercent}%\n`);

  // All boutiques
  const { count: allTotal } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .eq('primary_category', 'Boutique');

  const { count: allProcessed } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .eq('primary_category', 'Boutique')
    .not('natural_name', 'is', null);

  const allPending = allTotal - allProcessed;
  const allPercent = Math.round((allProcessed / allTotal) * 100);

  console.log('📦 ALL BOUTIQUES:');
  console.log(`   Total: ${allTotal}`);
  console.log(`   ✅ Processed: ${allProcessed}`);
  console.log(`   ⏳ Pending: ${allPending}`);
  console.log(`   Progress: ${allPercent}%\n`);

  // Sample processed records to verify quality
  console.log('🔍 SAMPLE PROCESSED RECORDS:');
  const { data: samples } = await supabase
    .from('outbound_email_targets')
    .select('google_name, natural_name')
    .eq('primary_category', 'Boutique')
    .not('natural_name', 'is', null)
    .not('reference_city', 'is', null)
    .not('best_email', 'is', null)
    .limit(5);

  if (samples) {
    samples.forEach(s => {
      const removed = s.google_name.includes('Boutique') && !s.natural_name.includes('Boutique');
      const icon = removed ? '✅' : '❌';
      console.log(`   ${icon} "${s.google_name}" → "${s.natural_name}"`);
    });
  }

  // Check if any still have "Boutique" in natural_name
  const { count: stillHasBoutique } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .eq('primary_category', 'Boutique')
    .not('natural_name', 'is', null)
    .like('natural_name', '%Boutique%');

  if (stillHasBoutique > 0) {
    console.log(`\n⚠️  WARNING: ${stillHasBoutique} records still have "Boutique" in natural_name!`);
  }
}

// Run with auto-refresh
async function monitor() {
  while (true) {
    console.clear();
    await checkStatus();
    console.log('\n🔄 Refreshing in 5 seconds... (Ctrl+C to stop)');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Check if --monitor flag is passed
if (process.argv.includes('--monitor')) {
  monitor();
} else {
  checkStatus();
}