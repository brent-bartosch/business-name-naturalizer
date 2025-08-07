import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const ENABLE_SLACK = process.env.ENABLE_SLACK_NOTIFICATIONS === 'true';

/**
 * Send a notification to Slack
 * @param {string} message - The message to send
 * @param {Object} options - Additional options
 */
export async function sendSlackNotification(message, options = {}) {
  if (!ENABLE_SLACK || !SLACK_WEBHOOK_URL) {
    console.log('Slack notifications disabled or not configured');
    return;
  }

  try {
    const payload = {
      text: message,
      ...options
    };

    await axios.post(SLACK_WEBHOOK_URL, payload);
    console.log('✅ Slack notification sent');
  } catch (error) {
    console.error('❌ Failed to send Slack notification:', error.message);
  }
}

/**
 * Send a formatted processing report to Slack
 * @param {Object} stats - Processing statistics
 */
export async function sendProcessingReport(stats) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🤖 Business Name Naturalization Report'
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Records Processed:*\n${stats.processed || 0}`
        },
        {
          type: 'mrkdwn',
          text: `*Natural Names Created:*\n${stats.naturalized || 0}`
        },
        {
          type: 'mrkdwn',
          text: `*From Cache:*\n${stats.from_cache || 0}`
        },
        {
          type: 'mrkdwn',
          text: `*API Calls:*\n${stats.api_calls || 0}`
        },
        {
          type: 'mrkdwn',
          text: `*Processing Time:*\n${stats.duration || 'N/A'}`
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${stats.status || 'completed'}`
        }
      ]
    }
  ];

  if (stats.errors && stats.errors.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *Errors:*\n${stats.errors.slice(0, 3).join('\n')}`
      }
    });
  }

  if (stats.pending_records > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📊 *Still Pending:* ${stats.pending_records} records`
      }
    });
  }

  await sendSlackNotification('Processing Report', { blocks });
}

/**
 * Send an error alert to Slack
 * @param {Error} error - The error that occurred
 * @param {Object} context - Additional context about the error
 */
export async function sendErrorAlert(error, context = {}) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 Naturalization Service Error'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error:* ${error.message}`
      }
    }
  ];

  if (context.trigger) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Trigger:* ${context.trigger}`
      }
    });
  }

  if (context.records_affected) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Records Affected:* ${context.records_affected}`
      }
    });
  }

  if (error.stack && process.env.NODE_ENV !== 'production') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Stack Trace:*\n\`\`\`${error.stack.slice(0, 500)}\`\`\``
      }
    });
  }

  await sendSlackNotification('Error Alert', { blocks });
}

/**
 * Send a startup notification
 */
export async function sendStartupNotification() {
  const message = '🚀 Business Name Naturalization Service started';
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: message
      }
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Environment: ${process.env.NODE_ENV || 'development'}`
        },
        {
          type: 'mrkdwn',
          text: `Cron: ${process.env.ENABLE_CRON === 'true' ? 'Enabled' : 'Disabled'}`
        },
        {
          type: 'mrkdwn',
          text: `Web Server: ${process.env.ENABLE_WEB_SERVER === 'true' ? 'Enabled' : 'Disabled'}`
        }
      ]
    }
  ];

  await sendSlackNotification(message, { blocks });
}