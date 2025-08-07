-- Migration: Add natural name support for SmartLead exports
-- Date: 2025-01-07
-- Purpose: Add natural_name column and caching table for business name naturalization

-- 1. Add natural_name column to outbound_email_targets if it doesn't exist
ALTER TABLE outbound_email_targets 
ADD COLUMN IF NOT EXISTS natural_name TEXT;

-- 2. Create index for faster lookups on records without natural names
CREATE INDEX IF NOT EXISTS idx_outbound_targets_natural_name_null 
ON outbound_email_targets(added_at DESC) 
WHERE natural_name IS NULL;

-- 3. Create cache table for naturalized names
CREATE TABLE IF NOT EXISTS business_name_naturalizations (
    id SERIAL PRIMARY KEY,
    original_name TEXT NOT NULL UNIQUE,
    natural_name TEXT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    usage_count INTEGER DEFAULT 1
);

-- 4. Create indexes for cache table
CREATE INDEX IF NOT EXISTS idx_naturalizations_original_name 
ON business_name_naturalizations(original_name);

CREATE INDEX IF NOT EXISTS idx_naturalizations_added_at 
ON business_name_naturalizations(added_at DESC);

-- 5. Create function to update last_used timestamp
CREATE OR REPLACE FUNCTION update_naturalization_usage()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_used_at = CURRENT_TIMESTAMP;
    NEW.usage_count = COALESCE(OLD.usage_count, 0) + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for usage tracking (optional, can be removed if not needed)
DROP TRIGGER IF EXISTS track_naturalization_usage ON business_name_naturalizations;
CREATE TRIGGER track_naturalization_usage
    BEFORE UPDATE ON business_name_naturalizations
    FOR EACH ROW
    WHEN (OLD.natural_name IS DISTINCT FROM NEW.natural_name)
    EXECUTE FUNCTION update_naturalization_usage();

-- 7. Create view for records needing naturalization
CREATE OR REPLACE VIEW pending_naturalizations AS
SELECT 
    oet.place_id,
    oet.google_name,
    oet.added_at,
    oet.reference_city,
    CASE 
        WHEN oet.added_at >= '2025-05-01'::date THEN 1
        ELSE 2
    END as priority
FROM outbound_email_targets oet
WHERE oet.natural_name IS NULL
    AND oet.google_name IS NOT NULL
ORDER BY priority, oet.added_at DESC;

-- 8. Create function to trigger naturalization service after populate_outbound_targets_batch
CREATE OR REPLACE FUNCTION notify_naturalization_needed()
RETURNS TRIGGER AS $$
DECLARE
    new_records_count INTEGER;
BEGIN
    -- Count new records that need naturalization
    SELECT COUNT(*) INTO new_records_count
    FROM outbound_email_targets
    WHERE natural_name IS NULL
        AND google_name IS NOT NULL
        AND added_at >= NOW() - INTERVAL '5 minutes';
    
    -- If there are new records, send notification
    IF new_records_count > 0 THEN
        -- This would typically call pg_notify or insert into a queue table
        -- For now, we'll just log it
        INSERT INTO process_log (process_name, status, details)
        VALUES (
            'naturalization_trigger',
            'pending',
            jsonb_build_object(
                'new_records', new_records_count,
                'triggered_at', NOW()
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger to fire after populate_outbound_targets_batch completes
DROP TRIGGER IF EXISTS trigger_naturalization_after_populate ON outbound_email_targets;
CREATE TRIGGER trigger_naturalization_after_populate
    AFTER INSERT ON outbound_email_targets
    FOR EACH STATEMENT
    EXECUTE FUNCTION notify_naturalization_needed();

-- 10. Grant necessary permissions (adjust based on your user/role setup)
-- GRANT SELECT, UPDATE ON outbound_email_targets TO your_render_user;
-- GRANT ALL ON business_name_naturalizations TO your_render_user;
-- GRANT SELECT ON pending_naturalizations TO your_render_user;

COMMENT ON TABLE business_name_naturalizations IS 'Cache table for storing naturalized business names to avoid duplicate API calls';
COMMENT ON COLUMN outbound_email_targets.natural_name IS 'AI-generated conversational version of business name for email personalization';
COMMENT ON VIEW pending_naturalizations IS 'View of all outbound_email_targets records that need natural name generation';