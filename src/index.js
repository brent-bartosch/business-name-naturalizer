import express from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import apiRoutes from './routes/api.js';
import { processBatch, processTriggeredRecords } from './services/batch.js';
import { sendStartupNotification, sendErrorAlert } from './services/slack.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_CRON = process.env.ENABLE_CRON === 'true';
const ENABLE_WEB_SERVER = process.env.ENABLE_WEB_SERVER === 'true';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 */2 * * *'; // Every 2 hours

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Business Name Naturalization Service',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      stats: '/api/stats',
      process: 'POST /api/process',
      processTriggered: 'POST /api/process-triggered',
      test: 'POST /api/test',
      webhook: 'POST /api/webhook'
    }
  });
});

/**
 * Start the service based on command line arguments or environment
 */
async function start() {
  console.log('🚀 Business Name Naturalization Service');
  console.log('=====================================');
  
  const args = process.argv.slice(2);
  const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1];
  const limit = parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0');
  
  try {
    // Send startup notification
    await sendStartupNotification();
    
    // Handle different modes
    if (mode === 'batch') {
      // Run batch processing once and exit
      console.log('🔄 Running batch processing...');
      const result = await processBatch({ trigger: 'cli', limit });
      console.log('✅ Batch processing complete');
      process.exit(0);
      
    } else if (mode === 'test') {
      // Run test processing
      console.log('🧪 Running test processing...');
      const { testProcessing } = await import('./services/batch.js');
      const result = await testProcessing(limit || 10);
      console.log('✅ Test complete:', result);
      process.exit(0);
      
    } else if (mode === 'triggered') {
      // Check for triggered records
      console.log('🔔 Checking for triggered records...');
      const result = await processTriggeredRecords();
      console.log('✅ Triggered processing complete:', result);
      process.exit(0);
      
    } else {
      // Normal service mode with optional cron and web server
      
      // Start cron job if enabled
      if (ENABLE_CRON) {
        console.log(`⏰ Scheduling cron job: ${CRON_SCHEDULE}`);
        
        cron.schedule(CRON_SCHEDULE, async () => {
          console.log('\n⏰ Cron job triggered');
          try {
            await processBatch({ trigger: 'cron' });
          } catch (error) {
            console.error('Cron job error:', error);
            await sendErrorAlert(error, { trigger: 'cron' });
          }
        });
        
        // Also check for triggered records every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
          try {
            await processTriggeredRecords();
          } catch (error) {
            console.error('Trigger check error:', error);
          }
        });
      }
      
      // Start web server if enabled
      if (ENABLE_WEB_SERVER) {
        app.listen(PORT, () => {
          console.log(`🌐 Web server running on port ${PORT}`);
          console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
        });
      }
      
      // If neither cron nor web server is enabled, just run once
      if (!ENABLE_CRON && !ENABLE_WEB_SERVER) {
        console.log('⚠️  Neither cron nor web server enabled, running once...');
        const result = await processBatch({ trigger: 'startup' });
        console.log('✅ Processing complete');
        process.exit(0);
      }
    }
    
  } catch (error) {
    console.error('❌ Startup error:', error);
    await sendErrorAlert(error, { trigger: 'startup' });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the service
start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});