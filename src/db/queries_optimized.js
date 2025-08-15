import supabase from './client.js';

/**
 * Get records by categories that have uncached names
 * This version is optimized to only return records with names not in cache
 * @param {Array<string>} categories - Categories to filter by
 * @param {number} limit - Maximum number of records to fetch
 * @returns {Promise<Array>} Array of records needing naturalization
 */
export async function getUncachedRecordsByCategories(categories, limit = 50) {
  console.log(`🔍 Finding uncached records for categories: ${categories.join(', ')} (limit: ${limit})`);
  
  // First, get ALL unique names that need processing for these categories
  // Don't limit here - we need to see all pending to find uncached ones
  const { data: pendingRecords, error: pendingError } = await supabase
    .from('outbound_email_targets')
    .select('google_name')
    .in('primary_category', categories)
    .is('natural_name', null);

  if (pendingError) throw pendingError;
  if (!pendingRecords || pendingRecords.length === 0) {
    console.log('No pending records found for these categories');
    return [];
  }

  // Get unique names
  const uniqueNames = [...new Set(pendingRecords.map(r => r.google_name))];
  console.log(`📊 Found ${pendingRecords.length} pending records with ${uniqueNames.length} unique names`);
  
  // Check which names are already in cache
  // Handle large arrays by chunking (Supabase has limits on IN operator)
  const cachedNames = [];
  const chunkSize = 500; // Safe chunk size for Supabase IN operator
  
  for (let i = 0; i < uniqueNames.length; i += chunkSize) {
    const chunk = uniqueNames.slice(i, i + chunkSize);
    const { data, error: cacheError } = await supabase
      .from('business_name_naturalizations')
      .select('original_name')
      .in('original_name', chunk);
    
    if (cacheError) throw cacheError;
    if (data) cachedNames.push(...data);
  }
  
  const cachedSet = new Set((cachedNames || []).map(c => c.original_name));
  const uncachedNames = uniqueNames.filter(name => !cachedSet.has(name));
  
  console.log(`💾 Cache status: ${cachedSet.size} cached, ${uncachedNames.length} uncached`);
  
  if (uncachedNames.length === 0) {
    console.log('⚠️ All pending names are already cached - returning cached names for update');
    // If all are cached, still return some records so they can be updated with cached values
    const namesToProcess = uniqueNames.slice(0, limit);
    const { data, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name, primary_category')
      .in('primary_category', categories)
      .in('google_name', namesToProcess)
      .is('natural_name', null)
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  }

  // Get records for uncached names first, up to limit
  const namesToProcess = uncachedNames.slice(0, limit);
  console.log(`🎯 Fetching ${namesToProcess.length} records with uncached names`);
  
  const { data, error } = await supabase
    .from('outbound_email_targets')
    .select('place_id, google_name, primary_category')
    .in('primary_category', categories)
    .in('google_name', namesToProcess)
    .is('natural_name', null)
    .limit(limit);

  if (error) throw error;
  
  console.log(`✅ Returning ${(data || []).length} records for processing`);
  return data || [];
}

/**
 * Get priority records with uncached names first
 * @param {Array<string>} categories - Categories to process
 * @param {number} limit - Maximum records to process
 * @returns {Promise<Object>} Object with records and stats
 */
export async function getPriorityRecordsOptimized(categories, limit = 100) {
  console.log(`🔍 Finding uncached records for categories: ${categories.join(', ')}`);
  
  // Get distinct names that need processing
  const { data: needsProcessing, error: err1 } = await supabase
    .rpc('get_unique_pending_names_by_category', { 
      categories: categories,
      max_records: limit * 3 
    });

  if (err1) {
    // Fallback if RPC doesn't exist
    console.log('Using fallback query method');
    return getRecordsByCategories(categories, limit);
  }

  if (!needsProcessing || needsProcessing.length === 0) {
    return [];
  }

  const uniqueNames = needsProcessing.map(r => r.google_name);
  
  // Check cache
  const { data: cached, error: err2 } = await supabase
    .from('business_name_naturalizations')
    .select('original_name')
    .in('original_name', uniqueNames);

  if (err2) throw err2;

  const cachedSet = new Set((cached || []).map(c => c.original_name));
  
  // Prioritize uncached names
  const uncachedNames = uniqueNames.filter(n => !cachedSet.has(n));
  const cachedNames = uniqueNames.filter(n => cachedSet.has(n));
  
  console.log(`📊 Found ${uncachedNames.length} uncached and ${cachedNames.length} cached names`);
  
  // Build list with uncached first
  const prioritizedNames = [...uncachedNames, ...cachedNames].slice(0, limit);
  
  // Get full records for these names
  const { data: records, error: err3 } = await supabase
    .from('outbound_email_targets')
    .select('place_id, google_name, primary_category')
    .in('primary_category', categories)
    .in('google_name', prioritizedNames)
    .is('natural_name', null);

  if (err3) throw err3;
  
  return records || [];
}

// Export the existing function name for compatibility
export { getPriorityRecordsOptimized as getRecordsByCategories };