import express from 'express';
import processor from '../services/processor.js';
import { processBatch, processTriggeredRecords, testProcessing } from '../services/batch.js';
import { getProcessingStats, getPriorityCategoryStats } from '../db/queries.js';
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
    
    // Process in background using new processor
    processor.processUniqueNames(null, limit).catch(error => {
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
    
    // Run test processing using new processor
    const result = await processor.processUniqueNames(null, limit);
    
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
 * Process priority category records - UPDATED TO USE NEW PROCESSOR
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
    
    // Use the new processor's priority categories method
    const result = await processor.processPriorityCategories(categories, limit);
    
    // Handle API credit exhaustion
    if (!result.success && result.code === 'CREDITS_EXHAUSTED') {
      return res.status(402).json({
        success: false,
        error: result.error,
        code: result.code
      });
    }
    
    res.json({
      success: result.success,
      processed: result.processed || 0,
      remaining: result.remaining || 0,
      cached: result.cached || 0,
      records_updated: result.records_updated || 0,
      message: result.message || `Processed ${result.processed} priority records`
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
    
    // Process in background using new processor
    processor.processUniqueNames(null, 100).catch(error => {
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