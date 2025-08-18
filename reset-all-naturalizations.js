import supabase from './src/db/client.js';

/**
 * Reset all natural_name fields to NULL to force re-processing
 * This is faster than trying to identify bad cache entries
 */
async function resetAllNaturalizations() {
  console.log('🔄 Resetting all natural_name fields to NULL for re-processing...');
  
  try {
    // Reset all natural_name fields to NULL
    const { error, count } = await supabase
      .from('outbound_email_targets')
      .update({ natural_name: null })
      .not('google_name', 'is', null);
    
    if (error) {
      console.error('❌ Error resetting natural_name fields:', error);
      return;
    }
    
    console.log(`✅ Reset ${count || 0} records for re-processing`);
    
    // Clear the entire cache to force fresh naturalizations
    console.log('🗑️ Clearing entire naturalization cache...');
    
    const { error: deleteError, count: deletedCount } = await supabase
      .from('business_name_naturalizations')
      .delete()
      .neq('id', 0); // Delete all records
    
    if (deleteError) {
      console.error('❌ Error clearing cache:', deleteError);
    } else {
      console.log(`✅ Cleared ${deletedCount || 0} cache entries`);
    }
    
    // Get final stats
    const { count: pendingCount } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .is('natural_name', null)
      .not('google_name', 'is', null);
    
    const { count: cacheCount } = await supabase
      .from('business_name_naturalizations')
      .select('*', { count: 'exact', head: true });
    
    console.log('\n📈 Final Status:');
    console.log(`  Records pending naturalization: ${pendingCount || 0}`);
    console.log(`  Cache entries remaining: ${cacheCount || 0}`);
    
    console.log('\n🚀 Ready to re-process with proper model!');
    console.log('   You can now trigger the naturalization service to re-process all records.');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

// Run the reset
resetAllNaturalizations().catch(console.error);