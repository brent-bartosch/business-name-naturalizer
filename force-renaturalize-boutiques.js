#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { naturalizeNames } from './src/services/openrouter.js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function forceRenaturalizeBoutiques() {
  console.log('🔥 FORCE RE-NATURALIZE ALL BOUTIQUES');
  console.log('================================');
  console.log('This will:');
  console.log('  1. Find ALL records where natural_name contains "Boutique"');
  console.log('  2. Delete their cache entries');
  console.log('  3. Re-naturalize with the fixed prompt');
  console.log('  4. Update the database');
  console.log('================================\n');

  try {
    // Step 1: Find ALL records where natural_name still has "Boutique"
    const { data: brokenRecords, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name, natural_name')
      .eq('primary_category', 'Boutique')
      .like('natural_name', '%Boutique%');

    if (error) {
      console.error('Error fetching records:', error);
      return;
    }

    console.log(`❌ Found ${brokenRecords.length} records with "Boutique" still in natural_name\n`);

    if (brokenRecords.length === 0) {
      console.log('✅ All boutiques are properly naturalized!');
      return;
    }

    // Get unique names that need fixing
    const namesToFix = [...new Set(brokenRecords.map(r => r.google_name))];
    console.log(`🔧 ${namesToFix.length} unique names to fix\n`);

    // Step 2: Delete old cache entries
    console.log('🗑️  Deleting bad cache entries...');
    for (let i = 0; i < namesToFix.length; i += 100) {
      const chunk = namesToFix.slice(i, i + 100);
      await supabase
        .from('business_name_naturalizations')
        .delete()
        .in('original_name', chunk);
    }
    console.log('✅ Cache cleared\n');

    // Step 3: Re-naturalize ALL of them with the fixed prompt
    console.log('🤖 Re-naturalizing with OpenRouter (this may take a moment)...\n');
    const batchSize = 20;
    const newNaturalizations = {};

    for (let i = 0; i < namesToFix.length; i += batchSize) {
      const batch = namesToFix.slice(i, i + batchSize);
      const progress = Math.min(i + batchSize, namesToFix.length);
      console.log(`   Processing ${progress}/${namesToFix.length}...`);
      
      try {
        const naturalNames = await naturalizeNames(batch);
        
        // Store results and save to cache
        const cacheEntries = [];
        for (let j = 0; j < batch.length; j++) {
          const original = batch[j];
          const natural = naturalNames[j] || original;
          newNaturalizations[original] = natural;
          cacheEntries.push({
            original_name: original,
            natural_name: natural
          });
          
          // Show examples of fixes
          if (original.includes('Boutique') && !natural.includes('Boutique')) {
            console.log(`     ✅ "${original}" → "${natural}"`);
          } else if (natural.includes('Boutique')) {
            console.log(`     ❌ FAILED: "${original}" → "${natural}"`);
          }
        }
        
        // Save to cache
        await supabase
          .from('business_name_naturalizations')
          .upsert(cacheEntries, {
            onConflict: 'original_name',
            ignoreDuplicates: false
          });
          
      } catch (err) {
        console.error(`   Error processing batch: ${err.message}`);
      }
      
      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 4: Update ALL records with new naturalizations
    console.log('\n📝 Updating database records...');
    let updated = 0;
    let fixed = 0;

    for (const record of brokenRecords) {
      const newNatural = newNaturalizations[record.google_name];
      if (newNatural && newNatural !== record.natural_name) {
        const { error: updateError } = await supabase
          .from('outbound_email_targets')
          .update({ natural_name: newNatural })
          .eq('place_id', record.place_id);
        
        if (!updateError) {
          updated++;
          if (!newNatural.includes('Boutique')) {
            fixed++;
          }
        }
      }
    }

    console.log(`\n================================`);
    console.log(`✅ COMPLETE!`);
    console.log(`   Updated: ${updated} records`);
    console.log(`   Fixed: ${fixed} records`);

    // Final check
    const { count: stillBroken } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .eq('primary_category', 'Boutique')
      .like('natural_name', '%Boutique%');

    if (stillBroken > 0) {
      console.log(`\n⚠️  WARNING: ${stillBroken} records still have "Boutique" in natural_name`);
      console.log(`   This may be due to names where "Boutique" is integral to the brand`);
    } else {
      console.log(`\n🎉 SUCCESS: All boutiques have been properly naturalized!`);
    }

  } catch (err) {
    console.error('❌ Fatal error:', err);
  }
}

// Run immediately
forceRenaturalizeBoutiques();