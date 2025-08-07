import pLimit from 'p-limit';
import * as db from '../db/queries.js';
import { naturalizeNames } from './openrouter.js';
import { sendProcessingReport, sendErrorAlert } from './slack.js';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 8;
const DELAY_BETWEEN_CALLS = parseInt(process.env.DELAY_BETWEEN_CALLS) || 1500;
const MAX_RECORDS_PER_RUN = parseInt(process.env.MAX_RECORDS_PER_RUN) || 1000;

/**
 * Process a batch of records to naturalize their names
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing statistics
 */
/**
 * Process priority category records
 * @param {Array<string>} categories - Categories to process
 * @param {number} limit - Maximum records to process
 * @returns {Promise<Object>} Processing result
 */
export async function processPriorityCategories(categories, limit = 50) {
  const startTime = Date.now();
  const stats = {
    processed: 0,
    naturalized: 0,
    from_cache: 0,
    api_calls: 0,
    cached: 0,
    remaining: 0,
    errors: []
  };

  try {
    console.log(`🔴 Processing priority categories: ${categories.join(', ')}`);
    
    // Get records for specific categories
    const records = await db.getRecordsByCategories(categories, limit);
    
    if (records.length === 0) {
      console.log('✅ No priority records to process');
      return stats;
    }

    console.log(`📊 Found ${records.length} priority records`);
    
    // Extract unique business names
    const uniqueNames = [...new Set(records.map(r => r.google_name))];
    console.log(`🔍 ${uniqueNames.length} unique business names`);

    // Check cache
    const cachedNames = await db.getCachedNaturalNames(uniqueNames);
    const uncachedNames = uniqueNames.filter(name => !cachedNames[name]);
    
    stats.from_cache = Object.keys(cachedNames).length;
    console.log(`💾 Found ${stats.from_cache} names in cache`);
    
    // Process uncached names with AI
    if (uncachedNames.length > 0) {
      console.log(`🤖 Processing ${uncachedNames.length} names with AI...`);
      const naturalizedMap = await naturalizeNames(uncachedNames);
      
      // Save to cache
      const newCacheEntries = [];
      for (const [original, natural] of Object.entries(naturalizedMap)) {
        if (natural) {
          newCacheEntries.push({ original_name: original, natural_name: natural });
        }
      }
      
      if (newCacheEntries.length > 0) {
        await db.saveToCache(newCacheEntries);
        stats.cached = newCacheEntries.length;
      }
      
      // Combine with cached names
      Object.assign(cachedNames, naturalizedMap);
      stats.api_calls = uncachedNames.length;
    }
    
    // Update records with natural names
    const updatePromises = [];
    for (const record of records) {
      const naturalName = cachedNames[record.google_name];
      if (naturalName) {
        updatePromises.push(
          db.updateNaturalName(record.place_id, naturalName)
            .then(() => {
              stats.naturalized++;
              return true;
            })
            .catch(err => {
              console.error(`Failed to update ${record.place_id}:`, err.message);
              stats.errors.push({ place_id: record.place_id, error: err.message });
              return false;
            })
        );
      }
    }
    
    await Promise.all(updatePromises);
    stats.processed = records.length;
    
    // Get remaining count
    const remainingStats = await db.getPriorityCategoryStats(categories);
    stats.remaining = remainingStats.pending_count;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Priority processing complete in ${duration}s`);
    console.log(`   Processed: ${stats.processed}, Naturalized: ${stats.naturalized}`);
    console.log(`   Remaining: ${stats.remaining}`);
    
    return stats;
    
  } catch (error) {
    console.error('Priority processing error:', error);
    stats.errors.push({ general: error.message });
    throw error;
  }
}

export async function processBatch(options = {}) {
  const startTime = Date.now();
  const stats = {
    processed: 0,
    naturalized: 0,
    from_cache: 0,
    api_calls: 0,
    errors: [],
    status: 'started'
  };

  try {
    console.log('🚀 Starting batch processing...');
    
    // Get records to process
    const limit = options.limit || MAX_RECORDS_PER_RUN;
    const records = await db.getRecordsToProcess(limit);
    
    if (records.length === 0) {
      console.log('✅ No records to process');
      stats.status = 'no_records';
      return stats;
    }

    console.log(`📊 Found ${records.length} records to process`);
    
    // Extract unique business names
    const uniqueNames = [...new Set(records.map(r => r.google_name))];
    console.log(`🔍 ${uniqueNames.length} unique business names`);

    // Check cache for existing naturalizations
    const cachedNames = await db.getCachedNaturalNames(uniqueNames);
    const uncachedNames = uniqueNames.filter(name => !cachedNames[name]);
    
    stats.from_cache = Object.keys(cachedNames).length;
    console.log(`💾 Found ${stats.from_cache} names in cache`);

    // Process uncached names in batches
    const naturalizedMap = { ...cachedNames };
    
    if (uncachedNames.length > 0) {
      console.log(`🤖 Processing ${uncachedNames.length} new names with AI...`);
      
      for (let i = 0; i < uncachedNames.length; i += BATCH_SIZE) {
        const batch = uncachedNames.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(uncachedNames.length / BATCH_SIZE);
        
        console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} names)...`);
        
        try {
          // Call OpenRouter API
          const naturalNames = await naturalizeNames(batch);
          stats.api_calls++;
          
          // Map results
          const cacheEntries = [];
          for (let j = 0; j < batch.length; j++) {
            const originalName = batch[j];
            const naturalName = naturalNames[j] || originalName;
            
            naturalizedMap[originalName] = naturalName;
            cacheEntries.push({
              original_name: originalName,
              natural_name: naturalName
            });
          }
          
          // Save to cache
          await db.saveToCache(cacheEntries);
          stats.naturalized += cacheEntries.length;
          
          console.log(`✅ Batch ${batchNum} complete`);
          
          // Rate limiting delay
          if (i + BATCH_SIZE < uncachedNames.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS));
          }
          
        } catch (error) {
          console.error(`❌ Failed to process batch ${batchNum}:`, error.message);
          stats.errors.push(`Batch ${batchNum}: ${error.message}`);
          
          // Use original names as fallback
          for (const name of batch) {
            naturalizedMap[name] = name;
          }
        }
      }
    }

    // Update database records with natural names
    console.log('💾 Updating database records...');
    
    const updates = records.map(record => ({
      place_id: record.place_id,
      natural_name: naturalizedMap[record.google_name] || record.google_name
    }));
    
    await db.updateRecordsWithNaturalNames(updates);
    stats.processed = updates.length;
    
    // Get final statistics
    const finalStats = await db.getProcessingStats();
    stats.pending_records = finalStats.pending_records;
    
    // Calculate duration
    const duration = Math.round((Date.now() - startTime) / 1000);
    stats.duration = `${duration}s`;
    stats.status = 'completed';
    
    // Log to database
    await db.logProcessingResult({
      ...stats,
      timestamp: new Date().toISOString()
    });
    
    console.log('\n✅ Processing complete!');
    console.log(`📊 Processed: ${stats.processed} records`);
    console.log(`🤖 Naturalized: ${stats.naturalized} new names`);
    console.log(`💾 From cache: ${stats.from_cache} names`);
    console.log(`📞 API calls: ${stats.api_calls}`);
    console.log(`⏱️  Duration: ${stats.duration}`);
    
    if (stats.pending_records > 0) {
      console.log(`📋 Still pending: ${stats.pending_records} records`);
    }
    
    // Send Slack report
    await sendProcessingReport(stats);
    
    return stats;
    
  } catch (error) {
    console.error('❌ Fatal error in batch processing:', error);
    stats.status = 'error';
    stats.errors.push(error.message);
    
    // Send error alert
    await sendErrorAlert(error, {
      trigger: options.trigger || 'manual',
      records_affected: stats.processed
    });
    
    throw error;
  }
}

/**
 * Process records triggered by database event
 */
export async function processTriggeredRecords() {
  console.log('🔔 Processing triggered by database event');
  
  const needsProcessing = await db.checkIfNaturalizationNeeded();
  
  if (needsProcessing) {
    console.log('✅ New records detected, starting processing...');
    return await processBatch({ trigger: 'database' });
  } else {
    console.log('ℹ️  No pending triggers found');
    return { status: 'no_triggers' };
  }
}

/**
 * Test processing with a small batch
 */
export async function testProcessing(limit = 10) {
  console.log(`🧪 Testing with ${limit} records...`);
  return await processBatch({ 
    limit, 
    trigger: 'test' 
  });
}