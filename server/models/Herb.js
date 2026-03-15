const { supabase } = require('../lib/supabase');

const HerbModel = {
  async findAll() {
    const { data, error } = await supabase
      .from('herbs')
      .select('*')
      .eq('status', 'verified');
    if (error) throw error;
    return data;
  },

  async findByName(name) {
    const { data, error } = await supabase
      .from('herbs')
      .select('*')
      .eq('herb_name', name)
      .single();
    if (error) throw error;
    return data;
  },

  async search(query) {
    const { data, error } = await supabase
      .from('herbs')
      .select('*')
      .ilike('herb_name', `%${query}%`);
    if (error) throw error;
    return data;
  }
};

module.exports = HerbModel;
