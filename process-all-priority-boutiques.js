#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { naturalizeNames } from './src/services/openrouter.js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function processAllPriorityBoutiques() {
  console.log('🚀 PROCESSING ALL PRIORITY BOUTIQUES');
  console.log('================================');
  console.log('This will process ALL boutiques with:');
  console.log('  ✓ best_email IS NOT NULL');
  console.log('  ✓ reference_city IS NOT NULL');
  console.log('  ✓ "Boutique" in google_name');
  console.log('================================\n');

  try {
    // Get total count
    const { count: totalCount } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .eq('primary_category', 'Boutique')
      .not('reference_city', 'is', null)
      .not('best_email', 'is', null)
      .like('google_name', '%Boutique%');

    console.log(`📊 Total priority boutiques with "Boutique" in name: ${totalCount}\n`);

    let processed = 0;
    let actuallyFixed = 0;
    const batchSize = 100;

    while (processed < totalCount) {
      // Get next batch - only records that need fixing
      const { data: records, error } = await supabase
        .from('outbound_email_targets')
        .select('place_id, google_name')
        .eq('primary_category', 'Boutique')
        .not('reference_city', 'is', null)
        .not('best_email', 'is', null)
        .like('google_name', '%Boutique%')
        .or('natural_name.is.null,natural_name.like.%Boutique%')
        .limit(batchSize);

      if (error) {
        console.error('❌ Database error:', error);
        break;
      }

      if (!records || records.length === 0) {
        console.log('✅ No more records to process!');
        break;
      }

      console.log(`\n🔄 Processing batch: ${processed + 1} to ${processed + records.length}`);
      
      // Get unique names for this batch
      const uniqueNames = [...new Set(records.map(r => r.google_name))];
      
      // Check cache first
      const { data: cachedData } = await supabase
        .from('business_name_naturalizations')
        .select('original_name, natural_name')
        .in('original_name', uniqueNames);

      const cache = {};
      let cachedCount = 0;
      if (cachedData) {
        cachedData.forEach(row => {
          cache[row.original_name] = row.natural_name;
          cachedCount++;
        });
      }

      // Find names that need AI processing
      const uncachedNames = uniqueNames.filter(name => !cache[name]);
      console.log(`   💾 ${cachedCount} from cache, ${uncachedNames.length} need AI processing`);

      // Process uncached names with OpenRouter
      const naturalizedMap = { ...cache };
      
      if (uncachedNames.length > 0) {
        console.log(`   🤖 Calling OpenRouter API for ${uncachedNames.length} names...`);
        const naturalNames = await naturalizeNames(uncachedNames);
        
        // Save to cache and map
        const cacheEntries = [];
        for (let i = 0; i < uncachedNames.length; i++) {
          const originalName = uncachedNames[i];
          const naturalName = naturalNames[i] || originalName;
          naturalizedMap[originalName] = naturalName;
          cacheEntries.push({
            original_name: originalName,
            natural_name: naturalName
          });
        }
        
        // Save to cache
        if (cacheEntries.length > 0) {
          await supabase
            .from('business_name_naturalizations')
            .upsert(cacheEntries, {
              onConflict: 'original_name',
              ignoreDuplicates: false
            });
          
          // Show examples
          console.log('   Sample naturalizations:');
          cacheEntries.slice(0, 3).forEach(entry => {
            if (entry.original_name.includes('Boutique') && !entry.natural_name.includes('Boutique')) {
              console.log(`     ✅ "${entry.original_name}" → "${entry.natural_name}"`);
            }
          });
        }
      }

      // Update all records in this batch
      let batchFixed = 0;
      for (const record of records) {
        const naturalName = naturalizedMap[record.google_name] || record.google_name;
        
        // Update the record
        const { error: updateError } = await supabase
          .from('outbound_email_targets')
          .update({ natural_name: naturalName })
          .eq('place_id', record.place_id);
        
        if (!updateError && record.google_name.includes('Boutique') && !naturalName.includes('Boutique')) {
          batchFixed++;
          actuallyFixed++;
        }
      }

      console.log(`   ✅ Fixed ${batchFixed} boutique names in this batch`);
      processed += records.length;

      // Progress bar
      const percentage = Math.round((processed / totalCount) * 100);
      const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
      console.log(`   [${bar}] ${percentage}%`);
      
      // Small delay to avoid rate limits
      if (uncachedNames.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n================================');
    console.log(`🎉 COMPLETE!`);
    console.log(`   Processed: ${processed} records`);
    console.log(`   Fixed: ${actuallyFixed} boutique names`);
    
    // Final verification
    const { count: stillBroken } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .eq('primary_category', 'Boutique')
      .not('reference_city', 'is', null)
      .not('best_email', 'is', null)
      .like('google_name', '%Boutique%')
      .like('natural_name', '%Boutique%');

    if (stillBroken > 0) {
      console.log(`\n⚠️  ${stillBroken} records still need fixing`);
    } else {
      console.log(`\n✅ All priority boutiques have been naturalized correctly!`);
    }

  } catch (err) {
    console.error('❌ Fatal error:', err);
  }
}

// Run immediately
processAllPriorityBoutiques();