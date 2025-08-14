import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export async function naturalizeWithAI(businessNames) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  if (!businessNames || businessNames.length === 0) {
    return {};
  }

  const prompt = `Convert these business names to natural, conversational versions without formal suffixes.
Remove: LLC, Inc, Corporation, Corp, Ltd, Co, LP, LLP, PA, PC, PLLC, PLC, L.L.C., L.P., N.A., S.A., S.C., etc.
Keep: & (as "and" only if it sounds better)

Return ONLY a JSON object with original names as keys and naturalized names as values. No other text.

Names to convert:
${businessNames.map(name => `"${name}"`).join(',\n')}

Example format:
{"Original Name LLC": "Original Name", "Company & Co": "Company"}`;

  try {
    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/brent-bartosch/business-name-naturalizer',
          'X-Title': 'Business Name Naturalizer'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    
    // Try to parse JSON from the response
    let result = {};
    try {
      // Clean up the response - remove markdown code blocks if present
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', content);
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error('Could not extract valid JSON from response');
          return {};
        }
      }
    }

    return result;
  } catch (error) {
    if (error.response?.status === 402) {
      console.error('💳 OpenRouter API credits exhausted');
      throw error;
    }
    console.error('AI processing error:', error.message);
    throw error;
  }
}

export async function testConnection() {
  try {
    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Say "OK"' }],
        max_tokens: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/brent-bartosch/business-name-naturalizer',
          'X-Title': 'Business Name Naturalizer'
        }
      }
    );
    return response.data.choices[0].message.content.includes('OK');
  } catch (error) {
    console.error('OpenRouter connection test failed:', error.message);
    return false;
  }
}