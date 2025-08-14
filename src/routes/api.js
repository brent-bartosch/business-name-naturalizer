import express from 'express';
import { processBatch, processTriggeredRecords, testProcessing } from '../services/batch.js';
import { processConcurrently, continuousProcessing } from '../services/concurrent-processor.js';
import { getProcessingStats } from '../db/queries.js';
import { testConnection } from '../services/openrouter.js';

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