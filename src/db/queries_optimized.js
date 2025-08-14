import supabase from './client.js';

/**
 * Get records by categories that have uncached names
 * This version is optimized to only return records with names not in cache
 * @param {Array<string>} categories - Categories to filter by
 * @param {number} limit - Maximum number of records to fetch
 * @returns {Promise<Array>} Array of records needing naturalization
 */
export async function getUncachedRecordsByCategories(categories, limit = 50) {
  // First, get all unique names that need processing
  const { data: pendingRecords, error: pendingError } = await supabase
    .from('outbound_email_targets')
    .select('google_name')
    .in('primary_category', categories)
    .is('natural_name', null)
    .limit(limit * 2); // Get more to find uncached ones

  if (pendingError) throw pendingError;
  if (!pendingRecords || pendingRecords.length === 0) return [];

  // Get unique names
  const uniqueNames = [...new Set(pendingRecords.map(r => r.google_name))];
  
  // Check which names are already in cache
  const { data: cachedNames, error: cacheError } = await supabase
    .from('business_name_naturalizations')
    .select('original_name')
    .in('original_name', uniqueNames);

  if (cacheError) throw cacheError;
  
  const cachedSet = new Set((cachedNames || []).map(c => c.original_name));
  const uncachedNames = uniqueNames.filter(name => !cachedSet.has(name));
  
  if (uncachedNames.length === 0) {
    console.log('All pending names are already cached');
    return [];
  }

  // Now get the actual records for uncached names only
  const { data, error } = await supabase
    .from('outbound_email_targets')
    .select('place_id, google_name, primary_category')
    .in('primary_category', categories)
    .in('google_name', uncachedNames.slice(0, limit))
    .is('natural_name', null)
    .limit(limit);

  if (error) throw error;
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