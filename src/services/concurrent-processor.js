import pLimit from 'p-limit';
import * as db from '../db/queries.js';
import { naturalizeNames } from './openrouter.js';

// Configuration
const CONCURRENCY = parseInt(process.env.CONCURRENT_REQUESTS) || 10;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * Process records with concurrent API calls for maximum throughput
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing statistics
 */
export async function processConcurrently(options = {}) {
  const startTime = Date.now();
  const concurrencyLimit = pLimit(options.concurrency || CONCURRENCY);
  
  const stats = {
    processed: 0,
    naturalized: 0,
    from_cache: 0,
    api_calls: 0,
    errors: [],
    duration: 0,
    throughput: 0
  };

  try {
    console.log(`🚀 Starting concurrent processing with ${CONCURRENCY} parallel requests`);
    
    // Get records that need processing
    const limit = options.limit || 5000; // Process more records at once
    const records = await db.getRecordsToProcess(limit);
    
    if (records.length === 0) {
      console.log('✅ No records to process');
      return stats;
    }

    console.log(`📊 Processing ${records.length} records concurrently...`);
    
    // Group records by unique names for efficient caching
    const nameToRecords = {};
    records.forEach(record => {
      if (!nameToRecords[record.google_name]) {
        nameToRecords[record.google_name] = [];
      }
      nameToRecords[record.google_name].push(record);
    });
    
    const uniqueNames = Object.keys(nameToRecords);
    console.log(`🔍 ${uniqueNames.length} unique names to process`);
    
    // Check cache first
    const cachedNames = await db.getCachedNaturalNames(uniqueNames);
    const uncachedNames = uniqueNames.filter(name => !cachedNames[name]);
    
    stats.from_cache = Object.keys(cachedNames).length;
    console.log(`💾 ${stats.from_cache} names from cache, ${uncachedNames.length} need API calls`);
    
    // Process uncached names concurrently
    const naturalizedMap = { ...cachedNames };
    
    if (uncachedNames.length > 0) {
      const processPromises = uncachedNames.map(name => 
        concurrencyLimit(async () => {
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              console.log(`🤖 Processing: ${name} (attempt ${attempt})`);
              
              // Call AI to naturalize single name
              const results = await naturalizeNames([name]);
              const naturalName = results[0] || name;
              
              naturalizedMap[name] = naturalName;
              stats.api_calls++;
              
              // Save to cache immediately
              await db.saveToCache([{
                original_name: name,
                natural_name: naturalName
              }]);
              
              console.log(`✅ Naturalized: ${name} → ${naturalName}`);
              stats.naturalized++;
              
              return naturalName;
            } catch (error) {
              if (error.response?.status === 429) {
                // Rate limit - wait and retry
                console.log(`⏳ Rate limited, waiting ${RETRY_DELAY}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
              } else if (error.response?.status === 402) {
                // Credits exhausted
                console.error('💳 OpenRouter credits exhausted!');
                throw error;
              } else if (attempt === MAX_RETRIES) {
                console.error(`❌ Failed after ${MAX_RETRIES} attempts: ${name}`);
                stats.errors.push({ name, error: error.message });
                naturalizedMap[name] = name; // Use original as fallback
                return name;
              } else {
                // Other error - retry
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
              }
            }
          }
        })
      );
      
      // Wait for all concurrent processes to complete
      await Promise.all(processPromises);
    }
    
    // Update all records with natural names
    console.log('💾 Updating database records...');
    
    const updatePromises = [];
    for (const [originalName, recordList] of Object.entries(nameToRecords)) {
      const naturalName = naturalizedMap[originalName];
      if (naturalName) {
        for (const record of recordList) {
          updatePromises.push(
            db.updateNaturalName(record.place_id, naturalName)
              .then(() => {
                stats.processed++;
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
    }
    
    await Promise.all(updatePromises);
    
    // Calculate statistics
    const duration = (Date.now() - startTime) / 1000;
    stats.duration = `${duration.toFixed(1)}s`;
    stats.throughput = (stats.processed / duration).toFixed(1);
    
    // Get remaining count
    const finalStats = await db.getProcessingStats();
    stats.pending_records = finalStats.pending_records;
    
    console.log('\n✅ Concurrent processing complete!');
    console.log(`📊 Processed: ${stats.processed} records in ${stats.duration}`);
    console.log(`⚡ Throughput: ${stats.throughput} records/second`);
    console.log(`🤖 API calls: ${stats.api_calls}`);
    console.log(`💾 From cache: ${stats.from_cache}`);
    console.log(`📋 Remaining: ${stats.pending_records} records`);
    
    if (stats.errors.length > 0) {
      console.log(`⚠️  Errors: ${stats.errors.length}`);
    }
    
    return stats;
    
  } catch (error) {
    console.error('❌ Fatal error in concurrent processing:', error);
    stats.status = 'error';
    throw error;
  }
}

/**
 * Continuous processing loop
 * Keeps processing until all records are complete
 */
export async function continuousProcessing(options = {}) {
  console.log('🔄 Starting continuous processing loop...');
  
  const maxIterations = options.maxIterations || 1000;
  const batchSize = options.batchSize || 5000;
  const concurrency = options.concurrency || CONCURRENCY;
  
  let iteration = 0;
  let totalProcessed = 0;
  let totalDuration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n📍 Iteration ${iteration}/${maxIterations}`);
    
    const iterationStart = Date.now();
    
    try {
      const result = await processConcurrently({
        limit: batchSize,
        concurrency: concurrency
      });
      
      totalProcessed += result.processed;
      totalDuration += parseFloat(result.duration);
      
      if (result.processed === 0) {
        console.log('✅ All records processed!');
        break;
      }
      
      if (result.pending_records === 0) {
        console.log('✅ No more pending records!');
        break;
      }
      
      // Small delay between batches to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      if (error.response?.status === 402) {
        console.error('💳 OpenRouter credits exhausted. Stopping continuous processing.');
        break;
      }
      console.error(`❌ Error in iteration ${iteration}:`, error.message);
      
      // Wait longer before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    const avgThroughput = (totalProcessed / totalDuration).toFixed(1);
    console.log(`📈 Overall: ${totalProcessed} records in ${totalDuration.toFixed(1)}s (${avgThroughput} rec/s)`);
  }
  
  console.log('\n🏁 Continuous processing complete');
  console.log(`📊 Total processed: ${totalProcessed} records`);
  console.log(`⏱️  Total time: ${totalDuration.toFixed(1)}s`);
  
  return {
    iterations: iteration,
    totalProcessed,
    totalDuration: `${totalDuration.toFixed(1)}s`,
    avgThroughput: (totalProcessed / totalDuration).toFixed(1)
  };
}