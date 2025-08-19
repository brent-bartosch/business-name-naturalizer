#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { naturalizeNames } from './src/services/openrouter.js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function processPriorityBoutiques() {
  console.log('🎯 PRIORITY BOUTIQUE PROCESSOR');
  console.log('================================');
  console.log('Filters:');
  console.log('  ✓ primary_category = Boutique');
  console.log('  ✓ reference_city IS NOT NULL');
  console.log('  ✓ best_email IS NOT NULL');
  console.log('  ✓ natural_name IS NULL');
  console.log('================================\n');

  try {
    // Get count first
    const { count: totalCount } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .eq('primary_category', 'Boutique')
      .not('reference_city', 'is', null)
      .not('best_email', 'is', null)
      .is('natural_name', null);

    console.log(`📊 Total priority boutiques to process: ${totalCount}\n`);

    if (totalCount === 0) {
      console.log('✅ All priority boutiques already processed!');
      return;
    }

    let processed = 0;
    const batchSize = 50; // Process in smaller batches for better tracking

    while (processed < totalCount) {
      // Get next batch
      const { data: records, error } = await supabase
        .from('outbound_email_targets')
        .select('place_id, google_name')
        .eq('primary_category', 'Boutique')
        .not('reference_city', 'is', null)
        .not('best_email', 'is', null)
        .is('natural_name', null)
        .limit(batchSize);

      if (error) {
        console.error('❌ Database error:', error);
        break;
      }

      if (!records || records.length === 0) {
        console.log('✅ No more records to process');
        break;
      }

      console.log(`\n🔄 Processing batch: ${processed + 1} to ${processed + records.length} of ${totalCount}`);
      
      // Extract unique names
      const uniqueNames = [...new Set(records.map(r => r.google_name))];
      console.log(`   ${uniqueNames.length} unique business names in this batch`);

      // Check cache first
      const { data: cachedData } = await supabase
        .from('business_name_naturalizations')
        .select('original_name, natural_name')
        .in('original_name', uniqueNames);

      const cache = {};
      if (cachedData) {
        cachedData.forEach(row => {
          cache[row.original_name] = row.natural_name;
        });
      }

      const uncachedNames = uniqueNames.filter(name => !cache[name]);
      console.log(`   💾 ${Object.keys(cache).length} from cache, ${uncachedNames.length} need AI processing`);

      // Process uncached names with AI
      const naturalizedMap = { ...cache };
      
      if (uncachedNames.length > 0) {
        console.log(`   🤖 Calling OpenRouter API...`);
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
        
        if (cacheEntries.length > 0) {
          await supabase
            .from('business_name_naturalizations')
            .upsert(cacheEntries, {
              onConflict: 'original_name',
              ignoreDuplicates: false
            });
        }

        // Show sample transformations
        console.log('\n   Sample transformations:');
        cacheEntries.slice(0, 3).forEach(entry => {
          console.log(`     "${entry.original_name}" → "${entry.natural_name}"`);
        });
      }

      // Update all records in this batch
      let updated = 0;
      for (const record of records) {
        const { error: updateError } = await supabase
          .from('outbound_email_targets')
          .update({ natural_name: naturalizedMap[record.google_name] || record.google_name })
          .eq('place_id', record.place_id);
        
        if (!updateError) updated++;
      }

      console.log(`   ✅ Updated ${updated} records`);
      processed += records.length;

      // Progress bar
      const percentage = Math.round((processed / totalCount) * 100);
      const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2));
      console.log(`   [${bar}] ${percentage}%`);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n================================');
    console.log(`🎉 COMPLETE! Processed ${processed} priority boutique records`);
    
    // Final stats
    const { count: remaining } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .eq('primary_category', 'Boutique')
      .not('reference_city', 'is', null)
      .not('best_email', 'is', null)
      .is('natural_name', null);

    console.log(`📊 Remaining unprocessed: ${remaining || 0}`);

  } catch (err) {
    console.error('❌ Fatal error:', err);
  }
}

// Run immediately
processPriorityBoutiques();