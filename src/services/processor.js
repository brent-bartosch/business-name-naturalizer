// Enhanced processor.js for Render service - handles unique names efficiently
// Copy this to: naturalize-service/src/services/processor.js

import { supabase } from '../db/client.js';
import { naturalizeWithAI } from './ai.js';

class NaturalizationProcessor {
  constructor() {
    this.batchSize = 30; // Smaller batches for unique name processing
  }

  async processUniqueNames(category = null, limit = 100) {
    console.log(`[PROCESSOR] Starting unique name processing for ${category || 'all categories'}`);
    
    try {
      // Get unique pending names
      let query = supabase
        .from('outbound_email_targets')
        .select('google_name')
        .is('natural_name', null);
      
      if (category) {
        query = query.eq('primary_category', category);
      }
      
      const { data, error } = await query.limit(limit * 2); // Get more to find unique
      
      if (error) throw error;
      
      // Get unique names only
      const nameSet = new Set(data.map(r => r.google_name));
      const uniqueNames = Array.from(nameSet).slice(0, limit);
      
      console.log(`[PROCESSOR] Found ${uniqueNames.length} unique names to process`);
      
      let totalProcessed = 0;
      let totalRecordsUpdated = 0;
      let totalCached = 0;
      
      // Process in smaller batches
      for (let i = 0; i < uniqueNames.length; i += this.batchSize) {
        const batch = uniqueNames.slice(i, i + this.batchSize);
        
        // Check cache first
        const { data: cached } = await supabase
          .from('business_name_naturalizations')
          .select('original_name, natural_name')
          .in('original_name', batch);
        
        const cachedMap = {};
        if (cached) {
          cached.forEach(c => {
            cachedMap[c.original_name] = c.natural_name;
            totalCached++;
          });
        }
        
        // Process only uncached names
        const uncachedNames = batch.filter(n => !cachedMap[n]);
        let naturalizedMap = {...cachedMap};
        
        if (uncachedNames.length > 0) {
          console.log(`[PROCESSOR] Processing ${uncachedNames.length} new names, ${Object.keys(cachedMap).length} from cache`);
          
          try {
            const aiResults = await naturalizeWithAI(uncachedNames);
            
            // Save to cache
            const cacheEntries = [];
            for (const [orig, natural] of Object.entries(aiResults)) {
              if (natural) {
                cacheEntries.push({ 
                  original_name: orig, 
                  natural_name: natural,
                  created_at: new Date().toISOString()
                });
                naturalizedMap[orig] = natural;
              }
            }
            
            if (cacheEntries.length > 0) {
              const { error: cacheError } = await supabase
                .from('business_name_naturalizations')
                .upsert(cacheEntries, { onConflict: 'original_name' });
              
              if (cacheError) {
                console.error('[PROCESSOR] Cache save error:', cacheError);
              }
            }
          } catch (aiError) {
            console.error('[PROCESSOR] AI processing error:', aiError.message);
            if (aiError.response?.status === 402) {
              throw new Error('API_CREDITS_EXHAUSTED');
            }
            // Continue with cached results only
          }
        }
        
        // Update ALL records with these names
        for (const [originalName, naturalName] of Object.entries(naturalizedMap)) {
          if (naturalName) {
            let updateQuery = supabase
              .from('outbound_email_targets')
              .update({ 
                natural_name: naturalName,
                updated_at: new Date().toISOString()
              })
              .eq('google_name', originalName)
              .is('natural_name', null);
            
            if (category) {
              updateQuery = updateQuery.eq('primary_category', category);
            }
            
            const { data: updated, error: updateError } = await updateQuery.select();
            
            if (!updateError && updated) {
              totalRecordsUpdated += updated.length;
            }
          }
        }
        
        totalProcessed += batch.length;
      }
      
      // Get remaining count
      let remainingQuery = supabase
        .from('outbound_email_targets')
        .select('*', { count: 'exact', head: true })
        .is('natural_name', null);
      
      if (category) {
        remainingQuery = remainingQuery.eq('primary_category', category);
      }
      
      const { count: remaining } = await remainingQuery;
      
      console.log(`[PROCESSOR] Completed: ${totalProcessed} unique names, ${totalRecordsUpdated} records updated, ${totalCached} from cache`);
      
      return {
        success: true,
        processed: totalProcessed,
        records_updated: totalRecordsUpdated,
        cached: totalCached,
        remaining: remaining || 0
      };
      
    } catch (error) {
      console.error('[PROCESSOR] Processing error:', error);
      
      if (error.message === 'API_CREDITS_EXHAUSTED') {
        return {
          success: false,
          error: 'OpenRouter API credits exhausted',
          code: 'CREDITS_EXHAUSTED'
        };
      }
      
      throw error;
    }
  }

  async processPriorityCategories(categories, limit = 100) {
    console.log(`[PROCESSOR] Processing priority categories: ${categories.join(', ')}`);
    
    // Process each category with unique name handling
    let totalProcessed = 0;
    let totalRemaining = 0;
    
    for (const category of categories) {
      const result = await this.processUniqueNames(category, Math.floor(limit / categories.length));
      if (result.success) {
        totalProcessed += result.processed;
        totalRemaining += result.remaining;
      }
    }
    
    return {
      success: true,
      processed: totalProcessed,
      remaining: totalRemaining,
      message: `Processed ${totalProcessed} records across ${categories.length} categories`
    };
  }

  async getStats() {
    const stats = await supabase.rpc('get_processing_stats');
    return stats.data || {};
  }
}

export default new NaturalizationProcessor();