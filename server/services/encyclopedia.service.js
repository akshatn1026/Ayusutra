const { supabase } = require('../lib/supabase');

async function searchEncyclopedia(query) {
  if (!query || !query.trim()) {
    const { data: local } = await supabase
      .from('encyclopedia')
      .select('*')
      .limit(12);
    return { local: local || [], wiki: [] };
  }

  const [localResult, wikiResult] = await Promise.allSettled([
    supabase
      .from('encyclopedia')
      .select('*')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(6),
    fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query + ' ayurveda herbal medicine'
      )}&format=json&origin=*&srlimit=6`
    ).then((r) => r.json())
  ]);

  const local =
    localResult.status === 'fulfilled' ? localResult.value.data || [] : [];

  let wiki = [];
  if (wikiResult.status === 'fulfilled') {
    wiki = (wikiResult.value.query?.search || []).map((r) => ({
      id: `wiki_${r.pageid}`,
      name: r.title,
      description: r.snippet.replace(/<[^>]+>/g, ''),
      source: 'wikipedia',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`
    }));
  }

  return { local, wiki };
}

async function getEntry(id) {
  if (String(id).startsWith('wiki_')) {
    const title = String(id).replace('wiki_', '');
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    const d = await res.json();
    return {
      id,
      name: d.title,
      description: d.extract,
      image_url: d.thumbnail?.source,
      source: 'wikipedia',
      url: d.content_urls?.desktop?.page
    };
  }

  const { data } = await supabase
    .from('encyclopedia')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

module.exports = { searchEncyclopedia, getEntry };
