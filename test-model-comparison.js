import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.OPEN_ROUTER_API_KEY;

// Test business names covering various scenarios
const testNames = [
  "Birthday's Plus Floral & Party Store",
  "DeJa Vu Flowers Open late call after 12 AM",
  "The BookWorm Bookstore & More",
  "North Branch Floral",
  "Eye of the Cat‎",
  "Comforter Cobblestone Thrift Store",
  "Global Wholesale Clothing Manufacturer USA - Alanic Global",
  "Victoria's Secret & PINK by Victoria's Secret",
  "Betty Reiter Inc",
  "Smith & Associates LLC",
  "Joe's Pizza Restaurant",
  "24/7 Convenience Store Open All Night",
  "Bob's Auto Repair Shop Inc.",
  "Mary's Boutique & Fashion Center",
  "Johnson Family Dental Practice PA"
];

const prompt = `You are helping create natural, conversational versions of business names for email outreach. 

For each business name, create a shortened, natural version that would sound appropriate in an email greeting like "Hi [Natural Name],"

RULES:
1. Remove business type suffixes that aren't part of the actual name (Floral, Party Store, Bookstore, etc.)
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

Please process these business names and return ONLY the natural versions, one per line, in the same order:

${testNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}`;

async function testModel(modelName) {
  console.log(`\n🧪 Testing model: ${modelName}`);
  console.log('=' . repeat(60));
  
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: modelName,
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
          'Authorization': `Bearer ${API_KEY}`,
          'HTTP-Referer': 'https://localhost:3000',
          'X-Title': 'Model Comparison Test',
          'Content-Type': 'application/json'
        }
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const content = response.data.choices[0].message.content.trim();
    const usage = response.data.usage;
    
    // Parse the response
    const lines = content.split('\n').filter(line => line.trim());
    const naturalNames = lines.map(line => {
      return line.replace(/^\d+\.\s*/, '').trim();
    });

    // Calculate cost
    let cost = 0;
    if (modelName === 'anthropic/claude-3.5-sonnet') {
      // Claude 3.5 Sonnet: $3/M input, $15/M output
      cost = (usage.prompt_tokens * 3 / 1000000) + (usage.completion_tokens * 15 / 1000000);
    } else if (modelName === 'deepseek/deepseek-r1-0528-qwen3-8b:free') {
      cost = 0; // Free model
    }

    console.log(`\n📊 Results for ${modelName}:`);
    console.log(`⏱️  Response time: ${duration}s`);
    console.log(`📝 Tokens used: ${usage.prompt_tokens} input, ${usage.completion_tokens} output`);
    console.log(`💰 Cost: $${cost.toFixed(6)}`);
    console.log(`\n🔄 Transformations:`);
    
    for (let i = 0; i < testNames.length; i++) {
      const original = testNames[i];
      const natural = naturalNames[i] || '[MISSING]';
      console.log(`  ${original}`);
      console.log(`  → ${natural}`);
    }

    return {
      model: modelName,
      duration,
      cost,
      results: naturalNames,
      tokensUsed: usage
    };

  } catch (error) {
    console.error(`❌ Error testing ${modelName}:`, error.response?.data || error.message);
    return null;
  }
}

async function compareModels() {
  console.log('🔬 Business Name Naturalization Model Comparison');
  console.log('=' . repeat(60));
  console.log(`Testing with ${testNames.length} business names\n`);

  // Test Claude 3.5 Sonnet (current)
  const claudeResults = await testModel('anthropic/claude-3.5-sonnet');
  
  // Wait a bit between requests
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test DeepSeek free model
  const deepseekResults = await testModel('deepseek/deepseek-r1-0528-qwen3-8b:free');

  // Compare results
  console.log('\n\n📈 COMPARISON SUMMARY');
  console.log('=' . repeat(60));
  
  if (claudeResults && deepseekResults) {
    console.log('\n⚡ Performance:');
    console.log(`  Claude 3.5 Sonnet: ${claudeResults.duration}s`);
    console.log(`  DeepSeek (free):   ${deepseekResults.duration}s`);
    
    console.log('\n💰 Cost per 1000 names:');
    const claudeCostPer1000 = claudeResults.cost * (1000 / testNames.length);
    console.log(`  Claude 3.5 Sonnet: $${claudeCostPer1000.toFixed(2)}`);
    console.log(`  DeepSeek (free):   $0.00`);
    
    console.log('\n✅ Quality Check:');
    let matches = 0;
    let goodEnough = 0;
    
    for (let i = 0; i < testNames.length; i++) {
      const claudeResult = claudeResults.results[i];
      const deepseekResult = deepseekResults.results[i];
      
      if (claudeResult === deepseekResult) {
        matches++;
      }
      
      // Check if DeepSeek result is "good enough" (removed suffix/LLC/Inc)
      const original = testNames[i];
      if (deepseekResult && 
          !deepseekResult.includes('LLC') && 
          !deepseekResult.includes('Inc') &&
          !deepseekResult.includes('Corporation') &&
          deepseekResult.length < original.length) {
        goodEnough++;
      }
    }
    
    console.log(`  Exact matches: ${matches}/${testNames.length} (${(matches/testNames.length*100).toFixed(1)}%)`);
    console.log(`  Good enough:   ${goodEnough}/${testNames.length} (${(goodEnough/testNames.length*100).toFixed(1)}%)`);
    
    console.log('\n📊 For your 207,669 pending records:');
    const totalCostClaude = claudeCostPer1000 * 207.669;
    console.log(`  Claude 3.5 Sonnet: ~$${totalCostClaude.toFixed(2)}`);
    console.log(`  DeepSeek (free):   $0.00`);
    console.log(`  Potential savings: $${totalCostClaude.toFixed(2)}`);
    
    console.log('\n🎯 RECOMMENDATION:');
    if (goodEnough / testNames.length >= 0.85) {
      console.log('  ✅ DeepSeek free model is SUITABLE for this task!');
      console.log('  - Good enough accuracy for business name naturalization');
      console.log('  - Removes legal suffixes and cleans names effectively');
      console.log('  - FREE vs ~$' + totalCostClaude.toFixed(2) + ' for Claude');
      console.log('\n  To switch, set environment variable:');
      console.log('  OPENROUTER_MODEL=deepseek/deepseek-r1-0528-qwen3-8b:free');
    } else {
      console.log('  ⚠️  DeepSeek free model may not meet quality requirements');
      console.log('  - Consider testing with more samples');
      console.log('  - Or stick with Claude for better accuracy');
    }
  }
}

// Run comparison
compareModels().catch(console.error);