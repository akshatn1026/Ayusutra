const { supabase } = require('../lib/supabase');

const openAIConfigured = !!(
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY.length > 20 &&
  !process.env.OPENAI_API_KEY.includes('your-openai')
);

async function getAIResponse(userQuery) {
  if (openAIConfigured) {
    try {
      const { OpenAI } = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert Ayurvedic healthcare assistant. Answer questions about Ayurvedic herbs, medicines, treatments, and lifestyle. Be concise and accurate.'
          },
          { role: 'user', content: userQuery }
        ],
        max_tokens: 600
      });
      return { source: 'openai', response: res.choices[0].message.content };
    } catch (err) {
      console.warn('OpenAI call failed, falling back to free sources:', err.message);
    }
  }

  const searchTerm = userQuery
    .split(' ')
    .slice(0, 4)
    .join(' ');

  // FREE FALLBACK 1: Supabase herbs table
  try {
    const { data: herbData } = await supabase
      .from('herbs')
      .select('name, description, benefits, dosage, side_effects')
      .ilike('name', `%${searchTerm}%`)
      .limit(1);

    if (herbData && herbData.length > 0) {
      const h = herbData[0];
      const benefitsText = Array.isArray(h.benefits)
        ? h.benefits.join(', ')
        : h.benefits || 'See description';
      return {
        source: 'database',
        response: `**${h.name}**\n\n${h.description}\n\n**Benefits:** ${benefitsText}\n\n**Dosage:** ${h.dosage || 'Consult an Ayurvedic practitioner'}\n\n**Side Effects:** ${h.side_effects || 'None known at normal doses'}`
      };
    }
  } catch (err) {
    console.warn('Supabase herb lookup failed:', err.message);
  }

  // FREE FALLBACK 2: Wikipedia REST API
  try {
    const encoded = encodeURIComponent(searchTerm);
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
    );
    if (wikiRes.ok) {
      const data = await wikiRes.json();
      if (data.extract) {
        return {
          source: 'wikipedia',
          response: data.extract,
          url: data.content_urls?.desktop?.page
        };
      }
    }

    // Try search if direct lookup fails
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm + ' ayurveda')}&format=json&origin=*&srlimit=1`
    );
    const searchData = await searchRes.json();
    const title = searchData.query?.search?.[0]?.title;
    if (title) {
      const pageRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
      );
      const pageData = await pageRes.json();
      if (pageData.extract) {
        return {
          source: 'wikipedia',
          response: pageData.extract,
          url: pageData.content_urls?.desktop?.page
        };
      }
    }
  } catch (e) {
    console.warn('Wikipedia lookup failed:', e.message);
  }

  return {
    source: 'fallback',
    response:
      'I could not find specific information about that. Please try searching with a different term or browse our herbs and encyclopedia sections.'
  };
}

module.exports = { getAIResponse, openAIConfigured };
