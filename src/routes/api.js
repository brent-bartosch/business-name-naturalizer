import express from 'express';
import { processBatch, processTriggeredRecords, testProcessing } from '../services/batch.js';
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