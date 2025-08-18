import supabase from './src/db/client.js';

/**
 * Fix bad naturalizations where original_name = natural_name
 * This indicates the AI model failed and fell back to original names
 */
async function fixBadNaturalizations() {
  console.log('🔍 Finding bad naturalizations where original_name = natural_name...');
  
  try {
    // Get all bad cache entries with pagination
    let allBadEntries = [];
    let offset = 0;
    const batchSize = 1000;
    
    while (true) {
      console.log(`Fetching batch starting at offset ${offset}...`);
      
      const { data: batch, error: fetchError } = await supabase
        .from('business_name_naturalizations')
        .select('original_name, natural_name')
        .range(offset, offset + batchSize - 1);
      
      if (fetchError) {
        console.error('Error fetching batch:', fetchError);
        break;
      }
      
      if (!batch || batch.length === 0) {
        console.log('No more entries found');
        break;
      }
      
      // Filter bad entries in this batch
      const badInBatch = batch.filter(entry => entry.original_name === entry.natural_name);
      allBadEntries.push(...badInBatch);
      
      console.log(`  Found ${badInBatch.length} bad entries in this batch (${allBadEntries.length} total so far)`);
      
      // If we got less than the batch size, we've reached the end
      if (batch.length < batchSize) {
        break;
      }
      
      offset += batchSize;
    }
    
    const badEntries = allBadEntries;
    
    console.log(`📊 Found ${badEntries.length} bad cache entries`);
    
    if (badEntries.length === 0) {
      console.log('✅ No bad entries found');
      return;
    }
    
    // Delete bad cache entries in chunks
    const chunkSize = 500;
    let deletedCount = 0;
    
    for (let i = 0; i < badEntries.length; i += chunkSize) {
      const chunk = badEntries.slice(i, i + chunkSize);
      const originalNames = chunk.map(entry => entry.original_name);
      
      console.log(`🗑️  Deleting chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(badEntries.length / chunkSize)} (${originalNames.length} entries)...`);
      
      const { error: deleteError } = await supabase
        .from('business_name_naturalizations')
        .delete()
        .in('original_name', originalNames);
      
      if (deleteError) {
        console.error('Error deleting chunk:', deleteError);
        continue;
      }
      
      deletedCount += originalNames.length;
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Deleted ${deletedCount} bad cache entries`);
    
    // Now reset natural_name to NULL for these records so they can be re-processed
    console.log('🔄 Resetting natural_name to NULL for affected records...');
    
    const originalNames = badEntries.map(entry => entry.original_name);
    let resetCount = 0;
    
    for (let i = 0; i < originalNames.length; i += chunkSize) {
      const chunk = originalNames.slice(i, i + chunkSize);
      
      console.log(`🔄 Resetting chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(originalNames.length / chunkSize)} (${chunk.length} records)...`);
      
      const { error: updateError, count } = await supabase
        .from('outbound_email_targets')
        .update({ natural_name: null })
        .in('google_name', chunk);
      
      if (updateError) {
        console.error('Error resetting natural_name:', updateError);
        continue;
      }
      
      resetCount += count || 0;
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Reset ${resetCount} records for re-processing`);
    
    // Get final stats
    const { data: finalEntries } = await supabase
      .from('business_name_naturalizations')
      .select('original_name, natural_name');
    
    const remainingBad = finalEntries ? finalEntries.filter(entry => entry.original_name === entry.natural_name).length : 0;
    
    const { count: pendingCount } = await supabase
      .from('outbound_email_targets')
      .select('*', { count: 'exact', head: true })
      .is('natural_name', null)
      .not('google_name', 'is', null);
    
    console.log('\n📈 Final Status:');
    console.log(`  Remaining bad cache entries: ${remainingBad || 0}`);
    console.log(`  Records pending naturalization: ${pendingCount || 0}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

// Run the fix
fixBadNaturalizations().catch(console.error);