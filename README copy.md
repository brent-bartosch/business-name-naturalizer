# SmartLead Export Management

## Overview
This folder contains all SmartLead-related files for generating targeted prospect exports from the Supabase database. The system now includes AI-powered business name naturalization and place_id cross-referencing for comprehensive analytics.

## Folder Structure

### 📊 `/exports/`
Contains generated CSV files ready for SmartLead import:
- `smartlead_with_place_ids_2025-07-07T23-55-02.csv` - **LATEST** 6,113 records with natural names & place_ids ✅
- `smartlead_naturalized_2025-07-07T22-30-04.csv` - 6,113 records with AI-generated natural names ✅
- `smartlead_filtered_2025-07-07T21-55-11.csv` - 6,113 records (filtered to 51 target categories) ✅
- `smartlead_export_2025-07-01T22-07-58.csv` - 8,070 original florists export ✅
- `smartlead_export_2025-07-01T19-44-03.csv` - Earlier export

### 📈 `/analysis/`
Category analysis and filtering strategy:
- `filtered_categories_2025-07-01T22-31-22.csv` - Target categories ranked by volume (51 categories)
- `filtered_top_150_categories_2025-07-01T22-31-22.csv` - Top 150 categories analysis
- `smartlead_filtering_strategy.md` - Exclusion criteria and strategy
- `analyze_outbound_targets.js` - General outbound targets analysis
- `detailed_category_analysis.js` - Case-sensitive category analysis with variations
- `find_arts_variations.js` - Find all art-related category variations
- `full_category_analysis.js` - Complete analysis of all 12k+ records
- `quick_category_analysis.js` - Top 150 categories analysis
- `verify_counts.js` - Verify record counts and filters

### 🛠️ `/scripts/`
Generation and processing scripts:
- `generate_smartlead_export.js` - Main export script
- `export_smartlead_batch.js` - Batch processing
- `get_filtered_top_150.js` - Category analysis
- `smartlead_export_query.sql` - SQL queries
- `filter_export_simple.js` - Filter exports by allowed categories
- `naturalize_business_names.js` - AI-powered natural name generation
- `add_place_ids.js` - Cross-reference place_ids from outbound_email_targets
- `test_place_id_match.js` - Test place_id matching logic

## Key Target Categories (from analysis)

| Rank | Category | Records | % | Status |
|------|----------|---------|---|--------|
| 1 | Florist | 1,149 | 14.24% | ✅ Exported |
| 2 | Craft store | 977 | 12.11% | 🎯 Next target |
| 3 | Boutique | 430 | 5.33% | 🎯 High value |
| 4 | Home goods store | 356 | 4.41% | 🎯 Good prospect |
| 5 | Party store | 313 | 3.88% | 📋 Pipeline |

## New AI-Powered Features

### 🤖 Natural Name Generation
Uses Claude 3.5 Sonnet to create conversational business names for email personalization:
- **Original**: "Birthday's Plus Floral & Party Store" 
- **Natural**: "Birthday's Plus"
- **Usage**: Perfect for email greetings like "Hi Birthday's Plus,"

### 🗺️ Place ID Cross-Reference
Automatically matches Google Place IDs from the outbound_email_targets database:
- **97.3% match rate** using `google_name` + `reference_distance` + `reference_city`
- **Critical for analytics**: Track lead performance by location
- **Required**: All imported leads MUST contain place_id for proper analytics

## Usage

### Generate Complete Export (Recommended)
```bash
cd scripts/
# 1. Filter to target categories
node filter_export_simple.js

# 2. Add natural names with AI
node naturalize_business_names.js

# 3. Cross-reference place_ids
node add_place_ids.js
```

### Generate New Base Export
```bash
cd scripts/
node generate_smartlead_export.js
```

### Analyze Categories
```bash
# Quick category analysis (top 150)
cd analysis/
node quick_category_analysis.js

# Detailed analysis with variations
node detailed_category_analysis.js

# Full analysis of all records
node full_category_analysis.js

# Verify counts and filters
node verify_counts.js

# Find arts-related variations
node find_arts_variations.js
```

## Export Field Structure
**Latest export includes ALL fields for maximum flexibility:**
- `google_name` - Original business name
- `natural_name` - AI-generated conversational name for emails
- `place_id` - Google Place ID for analytics (97.3% coverage)
- `best_email` - Primary email contact
- `reference_city` - Search reference point
- `reference_distance` - Miles from reference
- `business_categories` - JSON array of all categories
- `primary_category` - Main business category
- `city`, `state`, `street`, `postal_code` - Complete address

## 🚨 Critical Analytics Requirements
**ALL SmartLead imports MUST include `place_id` for:**
- Lead source tracking by location
- Performance analytics by geographic region
- ROI analysis by reference city/distance
- Campaign optimization based on location data

## Processing Pipeline Status
1. ✅ **Base Export**: 8,070 florists exported
2. ✅ **Category Filtering**: 6,113 records (51 target categories)
3. ✅ **AI Naturalization**: 6,113 conversational names generated
4. ✅ **Place ID Matching**: 5,945 place_ids added (97.3% success rate)
5. ✅ **Ready for Import**: `smartlead_with_place_ids_2025-07-07T23-55-02.csv`

---
*Last updated: 2025-07-07*