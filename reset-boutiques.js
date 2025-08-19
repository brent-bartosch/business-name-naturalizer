import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://tovzwoxswfevywzutgsp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetBoutiqueNaturalizations() {
  console.log('🔄 Resetting boutique naturalizations...');
  
  try {
    // Reset all boutique records
    const { data, error, count } = await supabase
      .from('outbound_email_targets')
      .update({ natural_name: null })
      .eq('primary_category', 'Boutique')
      .not('google_name', 'is', null)
      .select('place_id', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Error resetting boutique records:', error);
      return;
    }
    
    console.log(`✅ Reset ${count} boutique records`);
    
    // Also remove boutique names from cache to force re-processing
    const { data: boutiqueNames } = await supabase
      .from('outbound_email_targets')
      .select('google_name')
      .eq('primary_category', 'Boutique')
      .not('google_name', 'is', null);
    
    if (boutiqueNames && boutiqueNames.length > 0) {
      const uniqueNames = [...new Set(boutiqueNames.map(r => r.google_name))];
      console.log(`🗑️  Clearing ${uniqueNames.length} boutique names from cache...`);
      
      // Delete from cache
      const { error: cacheError } = await supabase
        .from('business_name_naturalizations')
        .delete()
        .in('original_name', uniqueNames);
      
      if (cacheError) {
        console.error('⚠️  Error clearing cache:', cacheError.message);
      } else {
        console.log('✅ Cache cleared');
      }
    }
    
    // Get stats
    const { count: urgentCount } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .eq('primary_category', 'Boutique')
      .is('natural_name', null)
      .not('best_email', 'is', null)
      .not('reference_city', 'is', null);
    
    console.log(`\n📊 Stats:`);
    console.log(`   Total boutiques reset: ${count}`);
    console.log(`   Urgent (with email & city): ${urgentCount}`);
    console.log(`\n✅ Ready for re-processing with GPT-4o-mini model`);
    
  } catch (err) {
    console.error('❌ Failed:', err);
  }
  
  process.exit(0);
}

resetBoutiqueNaturalizations();