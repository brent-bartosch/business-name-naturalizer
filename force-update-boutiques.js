#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function forceUpdateBoutiques() {
  console.log('🔄 FORCE UPDATE BOUTIQUES WITH CORRECT NATURALIZATIONS');
  console.log('================================\n');

  try {
    // Get priority boutique records that still need processing
    const { data: records, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name, natural_name')
      .eq('primary_category', 'Boutique')
      .not('reference_city', 'is', null)
      .not('best_email', 'is', null)
      .like('google_name', '%Boutique%')
      .or('natural_name.is.null,natural_name.like.%Boutique%')
      .limit(500);

    if (error) {
      console.error('Error fetching records:', error);
      return;
    }

    console.log(`Found ${records.length} priority boutique records with "Boutique" in name\n`);

    // Process in smaller batches for cache lookup
    const cacheMap = {};
    const uniqueNames = [...new Set(records.map(r => r.google_name))];
    
    // Fetch cache in chunks of 50
    for (let i = 0; i < uniqueNames.length; i += 50) {
      const chunk = uniqueNames.slice(i, i + 50);
      const { data: cache, error: cacheError } = await supabase
        .from('business_name_naturalizations')
        .select('original_name, natural_name')
        .in('original_name', chunk);

      if (cacheError) {
        console.error('Error fetching cache chunk:', cacheError);
        continue;
      }
      
      if (cache) {
        cache.forEach(c => {
          cacheMap[c.original_name] = c.natural_name;
        });
      }
    }

    console.log(`Found ${Object.keys(cacheMap).length} cached naturalizations\n`);

    // Update in batches
    let updated = 0;
    let fixed = 0;
    const batchSize = 100;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      for (const record of batch) {
        const naturalName = cacheMap[record.google_name] || record.google_name;
        
        // Only update if there's a naturalization available
        if (naturalName !== record.google_name || !record.google_name.includes('Boutique')) {
          const { error: updateError } = await supabase
            .from('outbound_email_targets')
            .update({ natural_name: naturalName })
            .eq('place_id', record.place_id);
          
          if (!updateError) {
            updated++;
            if (record.google_name.includes('Boutique') && !naturalName.includes('Boutique')) {
              fixed++;
            }
          }
        }
      }
      
      console.log(`Progress: ${Math.min(i + batchSize, records.length)}/${records.length} records processed`);
    }

    console.log('\n================================');
    console.log(`✅ Updated ${updated} records`);
    console.log(`🎯 Fixed ${fixed} boutique names`);

    // Verify some samples
    console.log('\n🔍 SAMPLE VERIFICATIONS:');
    const { data: samples } = await supabase
      .from('outbound_email_targets')
      .select('google_name, natural_name')
      .eq('primary_category', 'Boutique')
      .like('google_name', '%Boutique%')
      .limit(5);

    if (samples) {
      samples.forEach(s => {
        const fixed = !s.natural_name.includes('Boutique');
        const icon = fixed ? '✅' : '❌';
        console.log(`   ${icon} "${s.google_name}" → "${s.natural_name}"`);
      });
    }

  } catch (err) {
    console.error('❌ Fatal error:', err);
  }
}

// Run immediately
forceUpdateBoutiques();