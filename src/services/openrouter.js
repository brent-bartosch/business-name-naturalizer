import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Switch to a better performing model since DeepSeek isn't naturalizing properly
const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 3;
const RETRY_DELAY = 3000; // 3 seconds

/**
 * Call OpenRouter API to naturalize business names
 * @param {Array<string>} businessNames - Array of business names to naturalize
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<Array<string>>} Array of naturalized names
 */
export async function naturalizeNames(businessNames, retryCount = 0) {
  const prompt = `You are helping create natural, conversational versions of business names for email outreach. 

For each business name, create a shortened, natural version that would sound appropriate in an email greeting like "Hi [Natural Name],"

RULES:
1. Remove business type suffixes that aren't part of the actual name (Boutique, Floral, Party Store, Bookstore, Shop, Store, etc.)
2. Remove legal entities (LLC, Co., Inc., Corporation, etc.)
3. Remove "The" prefix in most cases
4. Remove promotional/descriptive text (hours, locations, "call after", etc.)
5. Fix formatting issues (extra spaces, special characters like ‎)
6. Keep it conversational - what would a human naturally call this business?
7. If truncation would be confusing, keep more of the name
8. Remove quotation marks and clean up formatting

EXAMPLES:
- "Birthday's Plus Floral & Party Store" → "Birthday's Plus"
- "DeJa Vu Flowers Open late call after 12 AM" → "Deja Vu Flowers"  
- "Flower Shop at Ben Franklin" → "Flower Shop"
- "The BookWorm Bookstore & More" → "BookWorm"
- "North Branch Floral" → "North Branch"
- "Eye of the Cat‎" → "Eye of the Cat"
- "Cigi's Boutique" → "Cigi's"
- "Fashion Boutique NYC" → "Fashion NYC"

Please process these business names and return ONLY the natural versions, one per line, in the same order:

${businessNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}`;

  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: MODEL,
        models: [MODEL, 'openai/gpt-3.5-turbo'], // Add fallback model
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
          'HTTP-Referer': process.env.RENDER_EXTERNAL_URL || 'https://localhost:3000',
          'X-Title': 'SmartLead Business Name Naturalizer',
          'Content-Type': 'application/json'
        }
      }
    );

    // Log which model was actually used
    if (response.data.model) {
      console.log(`📍 Model used: ${response.data.model}`);
    }
    
    const content = response.data.choices[0].message.content.trim();
    
    // Parse the response - extract just the natural names
    const lines = content.split('\n').filter(line => line.trim());
    const naturalNames = lines.map(line => {
      // Remove numbering if present (1., 2., etc.)
      return line.replace(/^\d+\.\s*/, '').trim();
    });

    if (naturalNames.length !== businessNames.length) {
      console.warn(`⚠️  Response count mismatch. Expected ${businessNames.length}, got ${naturalNames.length}`);
      console.warn('Input names:', businessNames);
      console.warn('Output names:', naturalNames);
      
      // Pad with original names if needed
      while (naturalNames.length < businessNames.length) {
        naturalNames.push(businessNames[naturalNames.length]);
      }
    }

    return naturalNames;

  } catch (error) {
    console.error(`❌ API call failed (attempt ${retryCount + 1}):`, error.message);
    
    if (error.response) {
      console.error('API Error Response:', error.response.data);
    }
    
    if (retryCount < MAX_RETRIES) {
      console.log(`🔄 Retrying in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return naturalizeNames(businessNames, retryCount + 1);
    }
    
    // Return original names as fallback
    console.warn('⚠️  Using original names as fallback');
    return businessNames;
  }
}

/**
 * Test the OpenRouter connection
 */
export async function testConnection() {
  try {
    const testNames = ['Test Company LLC', 'The Sample Store'];
    const results = await naturalizeNames(testNames);
    console.log('✅ OpenRouter connection successful');
    console.log('Test results:', results);
    return true;
  } catch (error) {
    console.error('❌ OpenRouter connection failed:', error.message);
    return false;
  }
}