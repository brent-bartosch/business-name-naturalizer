# Business Name Naturalization Service

A modular Node.js service that uses AI to create natural, conversational versions of business names for SmartLead email campaigns. Deployed on Render with multiple trigger methods.

## 🚀 Features

- **AI-Powered Naturalization**: Uses Claude 3.5 Sonnet via OpenRouter to create conversational business names
- **Smart Caching**: Avoids duplicate API calls by caching naturalized names
- **3 Trigger Methods**:
  1. **Scheduled Cron**: Runs every 2 hours (configurable)
  2. **Web API**: Manual trigger via HTTP endpoints
  3. **Database Trigger**: Automatically runs after `populate_outbound_targets_batch()`
- **Batch Processing**: Processes names in batches of 8 for API efficiency
- **Slack Notifications**: Real-time alerts and processing reports
- **Priority Processing**: Prioritizes records created after 2025-05-01

## 📋 Prerequisites

1. **Supabase Database** with:
   - `outbound_email_targets` table
   - `exec_sql` function for migrations
   - Service key with appropriate permissions

2. **OpenRouter Account** with:
   - API key with access to Claude 3.5 Sonnet
   - Sufficient credits for API calls

3. **Slack Webhook** (optional):
   - Create at https://api.slack.com/apps
   - Add Incoming Webhooks feature
   - Get webhook URL

4. **Render Account** for deployment

## 🛠️ Installation

### Local Development

1. Clone and navigate to the service:
```bash
cd smartlead/naturalize-service
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Configure `.env`:
```env
# Required
SUPABASE_URL=https://tovzwoxswfevywzutgsp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
OPEN_ROUTER_API_KEY=your_openrouter_api_key_here

# Optional
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

5. Run database migrations:
```bash
npm run migrate
```

## 🚦 Usage

### Running Modes

#### 1. Service Mode (Web + Cron)
```bash
npm start
```
Starts web server on port 3000 and schedules cron jobs.

#### 2. Batch Processing (One-time)
```bash
npm run process
# Or with custom limit:
node src/index.js --mode=batch --limit=500
```

#### 3. Test Mode
```bash
npm test
# Or with custom limit:
node src/index.js --mode=test --limit=5
```

#### 4. Check Triggered Records
```bash
node src/index.js --mode=triggered
```

### API Endpoints

#### Health Check
```bash
GET /api/health
```

#### Get Statistics
```bash
GET /api/stats
```
Response:
```json
{
  "success": true,
  "stats": {
    "total_records": 111636,
    "naturalized_records": 23208,
    "pending_records": 88428,
    "high_priority_pending": 45000,
    "cached_names": 5945
  }
}
```

#### Manual Processing
```bash
POST /api/process
Content-Type: application/json

{
  "limit": 1000  // optional, defaults to MAX_RECORDS_PER_RUN
}
```

#### Process Triggered Records
```bash
POST /api/process-triggered
```

#### Test Processing
```bash
POST /api/test
Content-Type: application/json

{
  "limit": 10  // optional, defaults to 10
}
```

#### Webhook Endpoint
```bash
POST /api/webhook
Content-Type: application/json

{
  "secret": "your_webhook_secret",  // if WEBHOOK_SECRET is set
  "event": "populate_complete"
}
```

## 🚀 Deployment on Render

### 1. Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `naturalize-business-names`
   - **Root Directory**: `smartlead/naturalize-service`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 2. Add Environment Variables

In Render dashboard → Environment:

```env
SUPABASE_URL=https://tovzwoxswfevywzutgsp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPEN_ROUTER_API_KEY=your_openrouter_key
SLACK_WEBHOOK_URL=your_slack_webhook
NODE_ENV=production
PORT=10000
ENABLE_CRON=true
ENABLE_WEB_SERVER=true
ENABLE_SLACK_NOTIFICATIONS=true
BATCH_SIZE=8
MAX_RECORDS_PER_RUN=1000
CRON_SCHEDULE=0 */2 * * *
```

### 3. Deploy

Click "Manual Deploy" → "Deploy latest commit"

### 4. Set Up Database Trigger

After deployment, update your Supabase function to call the webhook:

```sql
-- In your populate_outbound_targets_batch function
PERFORM net.http_post(
  url := 'https://naturalize-business-names.onrender.com/api/webhook',
  body := jsonb_build_object(
    'event', 'populate_complete',
    'records', NEW_RECORDS_COUNT
  )
);
```

## 📊 How It Works

### Processing Flow

1. **Fetch Records**: Gets up to 1000 records without `natural_name`
2. **Check Cache**: Looks up existing naturalizations
3. **Batch API Calls**: Processes uncached names in batches of 8
4. **Save to Cache**: Stores new naturalizations for reuse
5. **Update Records**: Updates `outbound_email_targets` with natural names
6. **Send Report**: Notifies Slack with statistics

### Naturalization Examples

| Original Name | Natural Name |
|--------------|--------------|
| Birthday's Plus Floral & Party Store | Birthday's Plus |
| DeJa Vu Flowers Open late call after 12 AM | Deja Vu Flowers |
| The BookWorm Bookstore & More | BookWorm |
| North Branch Floral | North Branch |
| McDonald's Corporation #12345 | McDonald's |

### Caching Strategy

- Each unique business name is naturalized only once
- Results stored in `business_name_naturalizations` table
- Cache hits avoid API calls, saving costs
- Usage tracking for analytics

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_SIZE` | 8 | Names per API call |
| `DELAY_BETWEEN_CALLS` | 1500 | MS delay between API calls |
| `MAX_RETRIES` | 3 | API retry attempts |
| `MAX_RECORDS_PER_RUN` | 1000 | Records per processing run |
| `CRON_SCHEDULE` | `0 */2 * * *` | Cron expression (every 2 hours) |
| `ENABLE_CRON` | true | Enable scheduled processing |
| `ENABLE_WEB_SERVER` | true | Enable HTTP endpoints |
| `ENABLE_SLACK_NOTIFICATIONS` | true | Send Slack alerts |

## 📈 Monitoring

### Slack Notifications

The service sends:
- **Startup notifications**: When service starts
- **Processing reports**: After each batch completes
- **Error alerts**: When failures occur

### Database Logging

All processing is logged to `process_log` table:
```sql
SELECT * FROM process_log 
WHERE process_name = 'business_name_naturalization'
ORDER BY created_at DESC;
```

### Metrics to Track

- **Processing rate**: Records per hour
- **Cache hit rate**: Percentage from cache
- **API costs**: Calls × cost per call
- **Error rate**: Failed batches

## 🐛 Troubleshooting

### Common Issues

#### 1. API Rate Limits
- **Solution**: Increase `DELAY_BETWEEN_CALLS`
- **Alternative**: Reduce `BATCH_SIZE`

#### 2. Memory Issues
- **Solution**: Reduce `MAX_RECORDS_PER_RUN`
- **Alternative**: Increase Render instance size

#### 3. Database Timeouts
- **Solution**: Process smaller batches
- **Alternative**: Optimize database indexes

#### 4. Slack Not Working
- **Check**: Webhook URL is correct
- **Check**: `ENABLE_SLACK_NOTIFICATIONS=true`

### Debug Commands

```bash
# Test database connection
node -e "import('./src/db/client.js').then(m => console.log('DB OK'))"

# Test OpenRouter connection
node -e "import('./src/services/openrouter.js').then(m => m.testConnection())"

# Check pending records
node -e "import('./src/db/queries.js').then(m => m.getProcessingStats().then(console.log))"
```

## 📝 Database Schema

### Tables Created by Migration

#### `business_name_naturalizations`
```sql
CREATE TABLE business_name_naturalizations (
    id SERIAL PRIMARY KEY,
    original_name TEXT NOT NULL UNIQUE,
    natural_name TEXT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    usage_count INTEGER DEFAULT 1
);
```

#### `outbound_email_targets` (modified)
```sql
ALTER TABLE outbound_email_targets 
ADD COLUMN natural_name TEXT;
```

#### `pending_naturalizations` (view)
```sql
CREATE VIEW pending_naturalizations AS
SELECT place_id, google_name, added_at, reference_city,
       CASE WHEN added_at >= '2025-05-01' THEN 1 ELSE 2 END as priority
FROM outbound_email_targets
WHERE natural_name IS NULL AND google_name IS NOT NULL
ORDER BY priority, added_at DESC;
```

## 🤝 Contributing

1. Test locally with small batches
2. Ensure migrations are idempotent
3. Add error handling for new features
4. Update README with changes

## 📄 License

MIT

---

*Built for SmartLead email personalization by Smoothed*