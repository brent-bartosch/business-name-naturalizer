#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { naturalizeNames } from './src/services/openrouter.js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixBoutiqueCache() {
  console.log('🔧 FIXING BOUTIQUE CACHE');
  console.log('================================\n');

  try {
    // Step 1: Find all boutique names that need fixing
    console.log('📋 Finding boutique names that still have "Boutique" in them...');
    
    const { data: boutiqueRecords } = await supabase
      .from('outbound_email_targets')
      .select('google_name')
      .eq('primary_category', 'Boutique')
      .like('google_name', '%Boutique%')
      .not('google_name', 'is', null);

    if (!boutiqueRecords || boutiqueRecords.length === 0) {
      console.log('✅ No boutique names need fixing!');
      return;
    }

    const uniqueNames = [...new Set(boutiqueRecords.map(r => r.google_name))];
    console.log(`Found ${uniqueNames.length} unique boutique names to fix\n`);

    // Step 2: Delete old cache entries
    console.log('🗑️  Deleting old cache entries...');
    const { error: deleteError } = await supabase
      .from('business_name_naturalizations')
      .delete()
      .in('original_name', uniqueNames);

    if (deleteError) {
      console.error('Error deleting cache:', deleteError);
    } else {
      console.log('✅ Old cache entries deleted\n');
    }

    // Step 3: Re-naturalize with updated prompt
    console.log('🤖 Re-naturalizing with updated prompt...');
    const batchSize = 20;
    const newCache = [];

    for (let i = 0; i < uniqueNames.length; i += batchSize) {
      const batch = uniqueNames.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(uniqueNames.length/batchSize)}...`);
      
      const naturalNames = await naturalizeNames(batch);
      
      for (let j = 0; j < batch.length; j++) {
        newCache.push({
          original_name: batch[j],
          natural_name: naturalNames[j] || batch[j]
        });
        
        // Show first few examples
        if (i + j < 5) {
          console.log(`     "${batch[j]}" → "${naturalNames[j]}"`);
        }
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 4: Save new cache
    console.log('\n💾 Saving new cache entries...');
    const { error: cacheError } = await supabase
      .from('business_name_naturalizations')
      .upsert(newCache, {
        onConflict: 'original_name',
        ignoreDuplicates: false
      });

    if (cacheError) {
      console.error('Error saving cache:', cacheError);
    } else {
      console.log(`✅ Saved ${newCache.length} updated cache entries\n`);
    }

    // Step 5: Reset natural_name for all boutiques to force re-processing
    console.log('🔄 Resetting natural_name for all boutiques...');
    const { data: resetData, error: resetError } = await supabase
      .from('outbound_email_targets')
      .update({ natural_name: null })
      .eq('primary_category', 'Boutique')
      .select('place_id', { count: 'exact', head: true });

    if (resetError) {
      console.error('Error resetting records:', resetError);
    } else {
      console.log(`✅ Reset ${resetData?.length || 'all'} boutique records\n`);
    }

    console.log('================================');
    console.log('✅ CACHE FIX COMPLETE!');
    console.log('Now run process-priority-boutiques.js to re-process with correct naturalizations');

  } catch (err) {
    console.error('❌ Fatal error:', err);
  }
}

// Run immediately
fixBoutiqueCache();