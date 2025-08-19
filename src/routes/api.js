import express from 'express';
import { processBatch, processTriggeredRecords, testProcessing } from '../services/batch.js';
import { processConcurrently, continuousProcessing } from '../services/concurrent-processor.js';
import { getProcessingStats } from '../db/queries.js';
import { testConnection } from '../services/openrouter.js';
import supabase from '../db/client.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'naturalize-business-names',
    timestamp: new Date().toISOString()
  });
});

/**
 * Get processing statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getProcessingStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Trigger batch processing manually
 */
router.post('/process', async (req, res) => {
  try {
    const { limit } = req.body;
    
    // Start processing asynchronously
    res.json({
      success: true,
      message: 'Processing started',
      timestamp: new Date().toISOString()
    });
    
    // Process in background
    processBatch({ 
      limit, 
      trigger: 'api' 
    }).catch(error => {
      console.error('Background processing error:', error);
    });
    
  } catch (error) {
    console.error('Error starting processing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Process triggered records (from database events)
 */
router.post('/process-triggered', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Checking for triggered records',
      timestamp: new Date().toISOString()
    });
    
    // Process in background
    processTriggeredRecords().catch(error => {
      console.error('Background processing error:', error);
    });
    
  } catch (error) {
    console.error('Error processing triggered records:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test processing with a small batch
 */
router.post('/test', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    
    // Test connections first
    console.log('Testing connections...');
    const openrouterOk = await testConnection();
    
    if (!openrouterOk) {
      return res.status(500).json({
        success: false,
        error: 'OpenRouter connection failed'
      });
    }
    
    // Run test processing
    const result = await testProcessing(limit);
    
    res.json({
      success: true,
      message: 'Test completed',
      result
    });
    
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Process priority category records
 */
router.post('/process-priority', async (req, res) => {
  try {
    const { categories, limit = 50 } = req.body;
    
    if (!categories || !Array.isArray(categories)) {
      return res.status(400).json({
        success: false,
        error: 'Categories array is required'
      });
    }
    
    console.log(`🔴 Priority processing for categories: ${categories.join(', ')}`);
    
    // Import the priority processing function
    const { processPriorityCategories } = await import('../services/batch.js');
    
    // Process synchronously for immediate feedback
    const result = await processPriorityCategories(categories, limit);
    
    res.json({
      success: true,
      processed: result.processed,
      remaining: result.remaining,
      cached: result.cached,
      message: `Processed ${result.processed} priority records`
    });
    
  } catch (error) {
    console.error('Priority processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get priority category stats
 */
router.get('/stats/priority-categories', async (req, res) => {
  try {
    const { getPriorityCategoryStats } = await import('../db/queries.js');
    const stats = await getPriorityCategoryStats();
    
    res.json({
      success: true,
      count: stats.pending_count,
      categories: stats.categories
    });
  } catch (error) {
    console.error('Error getting priority stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Process records concurrently with high throughput
 */
router.post('/process-concurrent', async (req, res) => {
  try {
    const { limit = 5000, concurrency = 10 } = req.body;
    
    console.log(`🚀 Starting concurrent processing: ${concurrency} parallel requests, ${limit} records`);
    
    // Return immediate response
    res.json({
      success: true,
      message: 'Concurrent processing started',
      concurrency,
      limit,
      timestamp: new Date().toISOString()
    });
    
    // Process in background
    processConcurrently({ limit, concurrency })
      .then(stats => {
        console.log('✅ Concurrent processing complete:', stats);
      })
      .catch(error => {
        console.error('❌ Concurrent processing error:', error);
      });
    
  } catch (error) {
    console.error('Error starting concurrent processing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start continuous processing loop
 */
router.post('/process-continuous', async (req, res) => {
  try {
    const { 
      maxIterations = 100,
      batchSize = 5000,
      concurrency = 10 
    } = req.body;
    
    console.log(`🔄 Starting continuous processing loop`);
    console.log(`   Max iterations: ${maxIterations}`);
    console.log(`   Batch size: ${batchSize}`);
    console.log(`   Concurrency: ${concurrency}`);
    
    // Return immediate response
    res.json({
      success: true,
      message: 'Continuous processing started',
      maxIterations,
      batchSize,
      concurrency,
      timestamp: new Date().toISOString()
    });
    
    // Start continuous processing in background
    continuousProcessing({ maxIterations, batchSize, concurrency })
      .then(stats => {
        console.log('🏁 Continuous processing complete:', stats);
      })
      .catch(error => {
        console.error('❌ Continuous processing error:', error);
      });
    
  } catch (error) {
    console.error('Error starting continuous processing:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Ad hoc processing for urgent leads with specific filters
 */
router.post('/process-urgent-leads', async (req, res) => {
  try {
    const { limit = 1000 } = req.body;
    
    console.log(`🔥 Processing urgent leads: best_email NOT NULL, primary_category = 'Boutique', reference_city NOT NULL`);
    
    // Get urgent records with specific filters
    const { data: urgentRecords, error } = await supabase
      .from('outbound_email_targets')
      .select('place_id, google_name, primary_category, reference_city, best_email')
      .eq('primary_category', 'Boutique')
      .is('natural_name', null)
      .not('best_email', 'is', null)
      .not('reference_city', 'is', null)
      .limit(limit);
    
    if (error) {
      return res.status(500).json({
        success: false,
        error: `Database error: ${error.message}`
      });
    }
    
    if (!urgentRecords || urgentRecords.length === 0) {
      return res.json({
        success: true,
        message: 'No urgent records found matching criteria',
        processed: 0
      });
    }
    
    console.log(`📊 Found ${urgentRecords.length} urgent boutique leads`);
    
    // Import processing functions
    const { naturalizeNames } = await import('../services/openrouter.js');
    const { updateRecordsWithNaturalNames, saveToCache, getCachedNaturalNames } = await import('../db/queries.js');
    
    // Extract unique business names
    const uniqueNames = [...new Set(urgentRecords.map(r => r.google_name))];
    console.log(`🔍 ${uniqueNames.length} unique business names to process`);
    
    // Check cache first
    const cachedNames = await getCachedNaturalNames(uniqueNames);
    const uncachedNames = uniqueNames.filter(name => !cachedNames[name]);
    
    console.log(`💾 Found ${Object.keys(cachedNames).length} cached, ${uncachedNames.length} uncached`);
    
    // Process uncached names with AI
    const naturalizedMap = { ...cachedNames };
    if (uncachedNames.length > 0) {
      console.log(`🤖 Processing ${uncachedNames.length} new names with DeepSeek...`);
      const naturalNames = await naturalizeNames(uncachedNames);
      
      // Save to cache
      const cacheEntries = [];
      for (let i = 0; i < uncachedNames.length; i++) {
        const originalName = uncachedNames[i];
        const naturalName = naturalNames[i] || originalName;
        naturalizedMap[originalName] = naturalName;
        cacheEntries.push({
          original_name: originalName,
          natural_name: naturalName
        });
      }
      
      if (cacheEntries.length > 0) {
        await saveToCache(cacheEntries);
      }
    }
    
    // Update all urgent records
    const updates = urgentRecords.map(record => ({
      place_id: record.place_id,
      natural_name: naturalizedMap[record.google_name] || record.google_name
    }));
    
    const updated = await updateRecordsWithNaturalNames(updates);
    
    // Return immediate response
    res.json({
      success: true,
      message: 'Urgent boutique leads processed successfully',
      processed: updated,
      total_found: urgentRecords.length,
      unique_names: uniqueNames.length,
      from_cache: Object.keys(cachedNames).length,
      new_naturalizations: uncachedNames.length,
      sample_records: urgentRecords.slice(0, 3).map(r => ({
        google_name: r.google_name,
        natural_name: naturalizedMap[r.google_name],
        city: r.reference_city,
        has_email: !!r.best_email
      }))
    });
    
  } catch (error) {
    console.error('Urgent processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Minimal test endpoint that bypasses all complex query logic
 */
router.post('/minimal-test', async (req, res) => {
  try {
    console.log('🧪 Running minimal test on server...');
    
    // Import minimal test function
    const { default: minimalTest } = await import('../../minimal-test.js');
    
    // Run test in background
    res.json({
      success: true,
      message: 'Minimal test started - check logs for results',
      timestamp: new Date().toISOString()
    });
    
    // Execute test
    minimalTest().catch(error => {
      console.error('❌ Minimal test error:', error);
    });
    
  } catch (error) {
    console.error('Minimal test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Webhook endpoint for external triggers (e.g., from Supabase)
 */
router.post('/webhook', async (req, res) => {
  try {
    const { secret, event } = req.body;
    
    // Verify webhook secret
    if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook secret'
      });
    }
    
    console.log('📨 Webhook received:', event);
    
    res.json({
      success: true,
      message: 'Webhook received, processing started'
    });
    
    // Process in background
    processBatch({ 
      trigger: 'webhook',
      event 
    }).catch(error => {
      console.error('Webhook processing error:', error);
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;