const { supabase } = require('../lib/supabase');

/**
 * Strips HTML tags from a string
 */
function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>?/gm, '').trim();
}

/**
 * Searches the encyclopedia using both Supabase and Wikipedia.
 * Supabase results are prioritized first.
 */
async function searchEncyclopedia(query) {
  if (!query) return { success: true, results: [] };
  
  const results = [];
  const lowercaseQuery = query.toLowerCase();

  // 1. Search local Supabase encyclopedia table
  try {
    const { data: localData, error } = await supabase
      .from('encyclopedia')
      .select('id, title, content')
      .ilike('title', `%${lowercaseQuery}%`)
      .limit(10);
      
    if (!error && localData) {
      for (const item of localData) {
        results.push({
          id: item.id.toString(),
          title: item.title,
          contentPreview: item.content.substring(0, 150) + '...',
          source: 'ayusutra'
        });
      }
    }
  } catch (err) {
    console.error('Supabase encyclopedia search error:', err.message);
  }

  // 2. Search Wikipedia as fallback/supplement
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(lowercaseQuery + ' ayurveda')}&format=json&origin=*&srlimit=5`
    );
    
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const wikiItems = searchData.query?.search || [];
      
      for (const item of wikiItems) {
        // Only add if not already in local results (by title match)
        const isDuplicate = results.some(r => r.title.toLowerCase() === item.title.toLowerCase());
        
        if (!isDuplicate) {
          results.push({
            id: encodeURIComponent(item.title), // use encoded title as ID for Wikipedia
            title: item.title,
            contentPreview: stripHtml(item.snippet) + '...',
            source: 'wikipedia',
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`
          });
        }
      }
    }
  } catch (err) {
    console.error('Wikipedia search error:', err.message);
  }

  return { success: true, results };
}

/**
 * Gets detailed entry information (from Supabase or Wikipedia based on ID/Source)
 */
async function getEntry(idOrTitle) {
  // First, check if it's a numeric ID for local Supabase entry
  if (/^[0-9A-Fa-f-]+$/.test(idOrTitle)) {
    try {
      const { data, error } = await supabase
        .from('encyclopedia')
        .select('*')
        .eq('id', idOrTitle)
        .maybeSingle();
        
      if (data && !error) {
        return {
          id: data.id.toString(),
          title: data.title,
          content: data.content,
          source: 'ayusutra'
        };
      }
    } catch (e) {
      // It might not be a UUID, ignore and fall through to Wikipedia
    }
  }

  // Fallback to fetching exact Wikipedia page summary if local missing or ID is title
  try {
    const title = decodeURIComponent(idOrTitle);
    const pageRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    
    if (pageRes.ok) {
      const pageData = await pageRes.json();
      return {
        id: idOrTitle,
        title: pageData.title,
        content: pageData.extract,
        source: 'wikipedia',
        url: pageData.content_urls?.desktop?.page,
        imageUrl: pageData.thumbnail?.source || null
      };
    }
  } catch (err) {
    console.error('Wikipedia detail fetch error:', err.message);
  }

  return null;
}

module.exports = {
  searchEncyclopedia,
  getEntry
};
