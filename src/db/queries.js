import supabase from './client.js';

/**
 * Get records that need naturalization (independent stores only)
 * @param {number} limit - Maximum number of records to fetch
 * @returns {Promise<Array>} Array of records needing naturalization
 */
export async function getRecordsToProcess(limit = 1000) {
  console.log(`🔍 Getting ${limit} records to process...`);
  
  try {
    // Use simple direct query that we know works
    const { data, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name')
      .is('natural_name', null)
      .not('google_name', 'is', null)
      .limit(limit);

    if (error) {
      console.error('❌ Database error in getRecordsToProcess:', error);
      throw error;
    }
    
    const records = (data || []).map(record => ({
      place_id: record.place_id,
      google_name: record.google_name,
      priority: 1
    }));
    
    console.log(`✅ Found ${records.length} records to process`);
    return records;
    
  } catch (err) {
    console.error('❌ Failed to get records:', err.message);
    throw err;
  }
}

/**
 * Get records by specific categories (independent stores only)
 * @param {Array<string>} categories - Categories to filter by
 * @param {number} limit - Maximum number of records to fetch
 * @returns {Promise<Array>} Array of records needing naturalization
 */
export async function getRecordsByCategories(categories, limit = 50) {
  console.log(`🔍 Getting ${limit} records for categories: ${categories.join(', ')}`);
  
  try {
    // Use simple direct query that we know works
    const { data, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name, primary_category')
      .in('primary_category', categories)
      .is('natural_name', null)
      .limit(limit);

    if (error) {
      console.error('❌ Database error in getRecordsByCategories:', error);
      throw error;
    }
    
    const records = (data || []).map(record => ({
      place_id: record.place_id,
      google_name: record.google_name,
      primary_category: record.primary_category
    }));
    
    console.log(`✅ Found ${records.length} records for categories`);
    return records;
    
  } catch (err) {
    console.error('❌ Failed to get records by categories:', err.message);
    throw err;
  }
}

/**
 * Get stats for priority categories
 * @param {Array<string>} categories - Categories to check (optional)
 * @returns {Promise<Object>} Stats object
 */
export async function getPriorityCategoryStats(categories = null) {
  let query = supabase
    .from('outbound_email_targets')
    .select('primary_category', { count: 'exact', head: true })
    .is('natural_name', null);
  
  if (categories) {
    query = query.in('primary_category', categories);
  } else {
    // Default priority categories
    query = query.in('primary_category', [
      'Thrift store',
      'Used book store',
      'Vintage clothing store',
      'Used clothing store',
      'Consignment shop',
      'Second hand store'
    ]);
  }

  const { count, error } = await query;
  
  if (error) throw error;
  
  return {
    pending_count: count || 0,
    categories: categories || [
      'Thrift store',
      'Used book store',
      'Vintage clothing store',
      'Used clothing store',
      'Consignment shop',
      'Second hand store'
    ]
  };
}

/**
 * Check if a natural name already exists in cache
 * @param {string} originalName - The original business name
 * @returns {Promise<string|null>} The cached natural name or null
 */
export async function getCachedNaturalName(originalName) {
  const { data, error } = await supabase
    .from('business_name_naturalizations')
    .select('natural_name')
    .eq('original_name', originalName)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw error;
  }

  // Update usage stats if found
  if (data) {
    await supabase
      .from('business_name_naturalizations')
      .update({ 
        last_used_at: new Date().toISOString(),
        usage_count: supabase.raw('usage_count + 1')
      })
      .eq('original_name', originalName);
  }

  return data?.natural_name || null;
}

/**
 * Get multiple cached natural names at once
 * @param {Array<string>} originalNames - Array of original business names
 * @returns {Promise<Object>} Map of original_name -> natural_name
 */
export async function getCachedNaturalNames(originalNames) {
  try {
    // Skip if no names to look up
    if (!originalNames || originalNames.length === 0) {
      return {};
    }

    console.log(`Looking up ${originalNames.length} names in cache...`);
    
    const { data, error } = await supabase
      .from('business_name_naturalizations')
      .select('original_name, natural_name')
      .in('original_name', originalNames);

    if (error) {
      console.error('Database error in getCachedNaturalNames:', error);
      console.error('Error code:', error.code);
      console.error('Error details:', error.details);
      // Don't throw, just return empty cache to continue processing
      return {};
    }

    const cache = {};
    if (data && data.length > 0) {
      data.forEach(row => {
        cache[row.original_name] = row.natural_name;
      });
      console.log(`Found ${data.length} cached names`);
    } else {
      console.log('No cached names found');
    }

    return cache;
  } catch (err) {
    console.error('Failed to get cached names:', err.message);
    console.error('Error stack:', err.stack);
    // Return empty cache on error to continue processing
    return {};
  }
}

/**
 * Save naturalized names to cache
 * @param {Array<{original_name: string, natural_name: string}>} names - Names to cache
 */
export async function saveToCache(names) {
  if (!names || names.length === 0) return;

  const { error } = await supabase
    .from('business_name_naturalizations')
    .upsert(names, {
      onConflict: 'original_name',
      ignoreDuplicates: false
    });

  if (error) throw error;
}

/**
 * Update a single record with natural name
 * @param {string} place_id - The place ID to update
 * @param {string} natural_name - The natural name
 */
export async function updateNaturalName(place_id, natural_name) {
  const { data, error } = await supabase
    .from('outbound_email_targets')
    .update({ natural_name })
    .eq('place_id', place_id);
  
  if (error) {
    console.error(`Failed to update ${place_id}:`, error.message);
    throw error;
  }
  
  return data;
}

/**
 * Update records with natural names
 * @param {Array<{place_id: string, natural_name: string}>} updates - Records to update
 */
export async function updateRecordsWithNaturalNames(updates) {
  // Process in chunks of 100 to avoid hitting Supabase limits
  const chunkSize = 100;
  let totalUpdated = 0;
  
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    
    // Use Promise.all for parallel updates within chunk
    const results = await Promise.all(
      chunk.map(async ({ place_id, natural_name }) => {
        try {
          const { data, error } = await supabase
            .from('outbound_email_targets')
            .update({ natural_name })
            .eq('place_id', place_id);
          
          if (error) {
            console.error(`Failed to update ${place_id}:`, error.message);
            return false;
          }
          return true;
        } catch (err) {
          console.error(`Error updating ${place_id}:`, err.message);
          return false;
        }
      })
    );
    
    totalUpdated += results.filter(r => r).length;
  }
  
  return totalUpdated;
}

/**
 * Get statistics about pending naturalizations
 */
export async function getProcessingStats() {
  const stats = {};

  // Total records
  const { count: totalCount } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true });
  
  stats.total_records = totalCount;

  // Records with natural names
  const { count: naturalizedCount } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .not('natural_name', 'is', null);
  
  stats.naturalized_records = naturalizedCount;

  // Pending records
  const { count: pendingCount } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .is('natural_name', null)
    .not('google_name', 'is', null);
  
  stats.pending_records = pendingCount;

  // High priority (after 2025-05-01)
  const { count: highPriorityCount } = await supabase
    .from('outbound_email_targets')
    .select('*', { count: 'exact', head: true })
    .is('natural_name', null)
    .not('google_name', 'is', null)
    .gte('added_at', '2025-05-01');
  
  stats.high_priority_pending = highPriorityCount;

  // Cache stats
  const { count: cacheCount } = await supabase
    .from('business_name_naturalizations')
    .select('*', { count: 'exact', head: true });
  
  stats.cached_names = cacheCount;

  return stats;
}

/**
 * Log processing results
 */
export async function logProcessingResult(details) {
  const { error } = await supabase
    .from('process_log')
    .insert({
      process_type: 'business_name_naturalization',
      status: details.status || 'completed',
      details: details
    });

  if (error) {
    console.error('Failed to log processing result:', error);
  }
}

/**
 * Check if naturalization is needed (for trigger detection)
 */
export async function checkIfNaturalizationNeeded() {
  const { data, error } = await supabase
    .from('process_log')
    .select('details')
    .eq('process_type', 'naturalization_trigger')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (data) {
    // Mark as processing
    await supabase
      .from('process_log')
      .update({ status: 'processing' })
      .eq('process_type', 'naturalization_trigger')
      .eq('status', 'pending');
  }

  return !!data;
}