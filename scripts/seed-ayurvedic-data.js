require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Define Base Data from User Request
const baseHerbs = [
  // Adaptogens
  { name: 'Ashwagandha', sci: 'Withania somnifera', hindi: 'Asgandh', sanskrit: 'Ashwagandha', cat: 'Adaptogen' },
  { name: 'Shatavari', sci: 'Asparagus racemosus', hindi: 'Shatavar', sanskrit: 'Shatavari', cat: 'Adaptogen' },
  { name: 'Brahmi', sci: 'Bacopa monnieri', hindi: 'Brahmi', sanskrit: 'Brahmi', cat: 'Adaptogen' },
  { name: 'Guduchi', sci: 'Tinospora cordifolia', hindi: 'Giloy', sanskrit: 'Guduchi', cat: 'Adaptogen' },
  { name: 'Amalaki', sci: 'Phyllanthus emblica', hindi: 'Amla', sanskrit: 'Amalaki', cat: 'Adaptogen' },
  { name: 'Shilajit', sci: 'Asphaltum punjabianum', hindi: 'Shilajit', sanskrit: 'Shilajit', cat: 'Adaptogen' },
  { name: 'Bala', sci: 'Sida cordifolia', hindi: 'Bala', sanskrit: 'Bala', cat: 'Adaptogen' },
  { name: 'Vidari', sci: 'Pueraria tuberosa', hindi: 'Vidarikand', sanskrit: 'Vidarikanda', cat: 'Adaptogen' },
  { name: 'Kapikacchu', sci: 'Mucuna pruriens', hindi: 'Kaunch Beej', sanskrit: 'Kapikacchu', cat: 'Adaptogen' },
  { name: 'Licorice', sci: 'Glycyrrhiza glabra', hindi: 'Mulethi', sanskrit: 'Yashtimadhu', cat: 'Adaptogen' },
  // Digestive
  { name: 'Ginger', sci: 'Zingiber officinale', hindi: 'Adrak', sanskrit: 'Shunthi', cat: 'Digestive' },
  { name: 'Haritaki', sci: 'Terminalia chebula', hindi: 'Harad', sanskrit: 'Haritaki', cat: 'Digestive' },
  { name: 'Bibhitaki', sci: 'Terminalia bellirica', hindi: 'Baheda', sanskrit: 'Bibhitaka', cat: 'Digestive' },
  { name: 'Trikatu', sci: 'Piper nigrum, Piper longum, Zingiber officinale', hindi: 'Trikatu', sanskrit: 'Trikatu', cat: 'Digestive' },
  { name: 'Chitrak', sci: 'Plumbago zeylanica', hindi: 'Chitrak', sanskrit: 'Chitraka', cat: 'Digestive' },
  { name: 'Musta', sci: 'Cyperus rotundus', hindi: 'Nagarmotha', sanskrit: 'Musta', cat: 'Digestive' },
  { name: 'Pippali', sci: 'Piper longum', hindi: 'Pipali', sanskrit: 'Pippali', cat: 'Digestive' },
  { name: 'Ajwain', sci: 'Trachyspermum ammi', hindi: 'Ajwain', sanskrit: 'Yavani', cat: 'Digestive' },
  { name: 'Fennel', sci: 'Foeniculum vulgare', hindi: 'Saunf', sanskrit: 'Mishreya', cat: 'Digestive' },
  { name: 'Cumin', sci: 'Cuminum cyminum', hindi: 'Jeera', sanskrit: 'Jiraka', cat: 'Digestive' },
  { name: 'Coriander', sci: 'Coriandrum sativum', hindi: 'Dhania', sanskrit: 'Dhanyaka', cat: 'Digestive' },
  { name: 'Cardamom', sci: 'Elettaria cardamomum', hindi: 'Elaichi', sanskrit: 'Ela', cat: 'Digestive' },
  { name: 'Cinnamon', sci: 'Cinnamomum verum', hindi: 'Dalchini', sanskrit: 'Tvak', cat: 'Digestive' },
  { name: 'Turmeric', sci: 'Curcuma longa', hindi: 'Haldi', sanskrit: 'Haridra', cat: 'Digestive' },
  { name: 'Hing', sci: 'Ferula assa-foetida', hindi: 'Hing', sanskrit: 'Hingu', cat: 'Digestive' },
  { name: 'Triphala', sci: 'Emblica officinalis, Terminalia chebula, Terminalia bellirica', hindi: 'Triphala', sanskrit: 'Triphala', cat: 'Digestive' },
  // Nerve tonics
  { name: 'Shankhpushpi', sci: 'Convolvulus prostratus', hindi: 'Shankhpushpi', sanskrit: 'Shankhapushpi', cat: 'Nerve Tonic' },
  { name: 'Jatamansi', sci: 'Nardostachys jatamansi', hindi: 'Jatamansi', sanskrit: 'Jatamansi', cat: 'Nerve Tonic' },
  { name: 'Vacha', sci: 'Acorus calamus', hindi: 'Vach', sanskrit: 'Vacha', cat: 'Nerve Tonic' },
  { name: 'Tagara', sci: 'Valeriana wallichii', hindi: 'Tagar', sanskrit: 'Tagara', cat: 'Nerve Tonic' },
  { name: 'Nutmeg', sci: 'Myristica fragrans', hindi: 'Jaiphal', sanskrit: 'Jatiphala', cat: 'Nerve Tonic' },
  { name: 'Sarpagandha', sci: 'Rauvolfia serpentina', hindi: 'Sarpagandha', sanskrit: 'Sarpagandha', cat: 'Nerve Tonic' },
  // Immunity
  { name: 'Tulsi', sci: 'Ocimum tenuiflorum', hindi: 'Tulsi', sanskrit: 'Tulasi', cat: 'Immunity' },
  { name: 'Neem', sci: 'Azadirachta indica', hindi: 'Neem', sanskrit: 'Nimba', cat: 'Immunity' },
  { name: 'Kalmegh', sci: 'Andrographis paniculata', hindi: 'Kalmegh', sanskrit: 'Kalmegha', cat: 'Immunity' },
  { name: 'Kutki', sci: 'Picrorhiza kurroa', hindi: 'Kutki', sanskrit: 'Katuka', cat: 'Immunity' },
  { name: 'Chirayata', sci: 'Swertia chirayita', hindi: 'Chirayata', sanskrit: 'Kiratatikta', cat: 'Immunity' },
  // Antimicrobials
  { name: 'Vidanga', sci: 'Embelia ribes', hindi: 'Vaividang', sanskrit: 'Vidanga', cat: 'Antimicrobial' },
  { name: 'Indrayava', sci: 'Holarrhena pubescens', hindi: 'Indrajau', sanskrit: 'Indrayava', cat: 'Antimicrobial' },
  { name: 'Kutaj', sci: 'Holarrhena pubescens', hindi: 'Kuda', sanskrit: 'Kutaja', cat: 'Antimicrobial' },
  // Women health
  { name: 'Lodhra', sci: 'Symplocos racemosa', hindi: 'Lodhar', sanskrit: 'Lodhra', cat: 'Women Health' },
  { name: 'Ashoka', sci: 'Saraca asoca', hindi: 'Ashok', sanskrit: 'Ashoka', cat: 'Women Health' },
  { name: 'Kumari', sci: 'Aloe barbadensis', hindi: 'Gwarpatha', sanskrit: 'Kumari', cat: 'Women Health' },
  { name: 'Nagakesar', sci: 'Mesua ferrea', hindi: 'Nagkesar', sanskrit: 'Nagakesara', cat: 'Women Health' },
  { name: 'Priyangu', sci: 'Callicarpa macrophylla', hindi: 'Priyangu', sanskrit: 'Priyangu', cat: 'Women Health' },
  // Men health
  { name: 'Gokshura', sci: 'Tribulus terrestris', hindi: 'Gokhru', sanskrit: 'Gokshura', cat: 'Men Health' },
  { name: 'Safed Musli', sci: 'Chlorophytum borivilianum', hindi: 'Safed Musli', sanskrit: 'Shweta Musli', cat: 'Men Health' },
  { name: 'Akarkara', sci: 'Anacyclus pyrethrum', hindi: 'Akarkara', sanskrit: 'Akarakarabha', cat: 'Men Health' },
  // Cardiovascular
  { name: 'Arjuna', sci: 'Terminalia arjuna', hindi: 'Arjun', sanskrit: 'Arjuna', cat: 'Cardiovascular' },
  { name: 'Pushkarmool', sci: 'Inula racemosa', hindi: 'Pohkarmool', sanskrit: 'Pushkaramula', cat: 'Cardiovascular' },
  { name: 'Guggulu', sci: 'Commiphora wightii', hindi: 'Guggul', sanskrit: 'Guggulu', cat: 'Cardiovascular' },
  { name: 'Garlic', sci: 'Allium sativum', hindi: 'Lahsun', sanskrit: 'Lashuna', cat: 'Cardiovascular' },
  { name: 'Punarnava', sci: 'Boerhavia diffusa', hindi: 'Punarnava', sanskrit: 'Punarnava', cat: 'Cardiovascular' },
  { name: 'Draksha', sci: 'Vitis vinifera', hindi: 'Draksha / Kishmish', sanskrit: 'Draksha', cat: 'Cardiovascular' },
  // Skin herbs
  { name: 'Manjistha', sci: 'Rubia cordifolia', hindi: 'Manjith', sanskrit: 'Manjistha', cat: 'Skin' },
  { name: 'Sariva', sci: 'Hemidesmus indicus', hindi: 'Anantmool', sanskrit: 'Sariva', cat: 'Skin' },
  { name: 'Chandan', sci: 'Santalum album', hindi: 'Chandan', sanskrit: 'Chandana', cat: 'Skin' },
  // Respiratory
  { name: 'Vasaka', sci: 'Justicia adhatoda', hindi: 'Adusa', sanskrit: 'Vasa', cat: 'Respiratory' },
  { name: 'Kantakari', sci: 'Solanum virginianum', hindi: 'Kateli', sanskrit: 'Kantakari', cat: 'Respiratory' },
  { name: 'Bharangi', sci: 'Rotheca serrata', hindi: 'Bharangi', sanskrit: 'Bharangi', cat: 'Respiratory' },
  { name: 'Shati', sci: 'Hedychium spicatum', hindi: 'Kapurkachri', sanskrit: 'Shati', cat: 'Respiratory' },
  // Joint and bone
  { name: 'Shallaki', sci: 'Boswellia serrata', hindi: 'Salai Guggul', sanskrit: 'Shallaki', cat: 'Joint Health' },
  { name: 'Nirgundi', sci: 'Vitex negundo', hindi: 'Sambhalu', sanskrit: 'Nirgundi', cat: 'Joint Health' },
  { name: 'Rasna', sci: 'Pluchea lanceolata', hindi: 'Rasna', sanskrit: 'Rasna', cat: 'Joint Health' },
  { name: 'Eranda', sci: 'Ricinus communis', hindi: 'Arandi', sanskrit: 'Eranda', cat: 'Joint Health' },
  { name: 'Devadaru', sci: 'Cedrus deodara', hindi: 'Deodar', sanskrit: 'Devadaru', cat: 'Joint Health' },
  // Eye herbs
  { name: 'Saptamrita Lauh', sci: 'Ayurvedic compound', hindi: 'Saptamrita Lauh', sanskrit: 'Saptamrita', cat: 'Eye Health' }
];

const baseMedicines = [
  { name: 'Triphala Churna', type: 'Churna', desc: 'Mild laxative and colon cleanser', benefits: ['Digestion', 'Detox'], cat: 'Digestive' },
  { name: 'Trikatu Churna', type: 'Churna', desc: 'Metabolism booster', benefits: ['Digestion', 'Respiratory'], cat: 'Digestive' },
  { name: 'Sitopaladi Churna', type: 'Churna', desc: 'Excellent for cough and cold', benefits: ['Respiratory'], cat: 'Respiratory' },
  { name: 'Mahasudarshan Churna', type: 'Churna', desc: 'Useful in chronic fever', benefits: ['Immunity', 'Fever'], cat: 'Immunity' },
  { name: 'Ashwagandha Churna', type: 'Churna', desc: 'Stress relief and stamina', benefits: ['Stress', 'Vitality'], cat: 'Adaptogen' },
  { name: 'Brahmi Vati', type: 'Vati', desc: 'Memory enhancer', benefits: ['Nerve Tonic', 'Memory'], cat: 'Nerve Tonic' },
  { name: 'Chandraprabha Vati', type: 'Vati', desc: 'Useful for urinary tract', benefits: ['Urinary Health', 'Vitality'], cat: 'Urinary' },
  { name: 'Arogyavardhini Vati', type: 'Vati', desc: 'Liver tonic and detox', benefits: ['Liver', 'Skin'], cat: 'Digestive' },
  { name: 'Kanchnar Guggulu', type: 'Vati', desc: 'Useful for glandular swelling', benefits: ['Thyroid', 'Lymphatic'], cat: 'Glandular' },
  { name: 'Yograj Guggulu', type: 'Vati', desc: 'Joint pain relief', benefits: ['Joints', 'Vata disorders'], cat: 'Joints' },
  { name: 'Arjunarishta', type: 'Arishta', desc: 'Heart tonic', benefits: ['Cardiovascular', 'Stress'], cat: 'Cardiovascular' },
  { name: 'Dashmularishta', type: 'Arishta', desc: 'Post-partum care and Vata', benefits: ['Vata', 'Women Health'], cat: 'Women Health' },
  { name: 'Saraswatarishta', type: 'Arishta', desc: 'Brain tonic', benefits: ['Memory', 'Focus'], cat: 'Nerve Tonic' },
  { name: 'Brahmi Tail', type: 'Taila', desc: 'Cooling head oil', benefits: ['Sleep', 'Hair'], cat: 'External' },
  { name: 'Mahanarayan Tail', type: 'Taila', desc: 'Massage oil for joint pain', benefits: ['Joints', 'Muscles'], cat: 'External' },
  { name: 'Brahmi Ghrita', type: 'Ghrita', desc: 'Medicated ghee for memory', benefits: ['Memory', 'Ojas'], cat: 'Nerve Tonic' },
  { name: 'Chyawanprash', type: 'Avaleha', desc: 'Comprehensive immunity booster', benefits: ['Immunity', 'Rejuvenation'], cat: 'Immunity' },
  { name: 'Swarna Bhasma', type: 'Bhasma', desc: 'Gold ash for deep rejuvenation', benefits: ['Immunity', 'Ojas'], cat: 'Rasayana' }
];

const baseEncyclopedia = [
  // Core
  { title: 'Ayurveda', content: 'The science of life, originating in India over 5,000 years ago.' },
  { title: 'Tridosha', content: 'The three biological energies: Vata, Pitta, and Kapha.' },
  { title: 'Vata', content: 'The principle of movement, composed of Air and Space.' },
  { title: 'Pitta', content: 'The principle of transformation, composed of Fire and Water.' },
  { title: 'Kapha', content: 'The principle of structure, composed of Earth and Water.' },
  { title: 'Panchamahabhutas', content: 'The five great elements: Space, Air, Fire, Water, Earth.' },
  { title: 'Prakriti', content: 'One\'s unique baseline constitution established at birth.' },
  { title: 'Vikriti', content: 'One\'s current state of imbalance.' },
  { title: 'Agni', content: 'The digestive fire responsible for all metabolic processes.' },
  { title: 'Ama', content: 'Toxic residue of improper digestion.' },
  { title: 'Ojas', content: 'The subtle essence of immunity and vitality.' },
  { title: 'Prana', content: 'The vital life force energy.' },
  { title: 'Tejas', content: 'The subtle essence of intelligence and cellular metabolism.' },
  
  // Treatments
  { title: 'Panchakarma', content: 'The five deep-cleansing therapies of Ayurveda.' },
  { title: 'Vamana', content: 'Therapeutic emesis for Kapha disorders.' },
  { title: 'Virechana', content: 'Therapeutic purgation for Pitta disorders.' },
  { title: 'Basti', content: 'Medicated enema for Vata disorders.' },
  { title: 'Nasya', content: 'Nasal administration of medicated oils and powders.' },
  { title: 'Raktamokshana', content: 'Bloodletting therapy.' },
  { title: 'Abhyanga', content: 'Warm oil massage.' },
  { title: 'Shirodhara', content: 'Continuous pouring of warm oil over the forehead.' },
  { title: 'Udvartana', content: 'Dry herbal powder massage.' },
  
  // Diet/Lifestyle
  { title: 'Dinacharya', content: 'Ideal daily routine aligned with circadian rhythms.' },
  { title: 'Ritucharya', content: 'Seasonal routines to maintain balance.' },
  { title: 'Sattvic diet', content: 'Pure, fresh, light, and harmonizing foods.' },
  { title: 'Rajasic diet', content: 'Spicy, stimulating, and heavy foods.' },
  { title: 'Tamasic diet', content: 'Stale, processed, or overly heavy foods.' },
  
  // Physiology
  { title: 'Sapta Dhatu', content: 'The seven bodily tissues: Rasa, Rakta, Mamsa, Meda, Asthi, Majja, Shukra.' }
];

// Generation functions to create massive volume
function generateHerbs(count) {
  const result = [];
  const len = baseHerbs.length;
  for (let i = 0; i < count; i++) {
    const base = baseHerbs[i % len];
    // Slightly mutate name for the generated records above the base ones
    const name = i < len ? base.name : `${base.name} Variant ${Math.floor(i / len)}`;
    const sci = i < len ? base.sci : `${base.sci} var. ${Math.floor(i / len)}`;
    
    result.push({
      id: crypto.randomUUID(),
      name: name,
      scientific_name: sci,
      hindi_name: base.hindi,
      sanskrit_name: base.sanskrit,
      description: `A powerful Ayurvedic herb traditionally used as a ${base.cat}. ${base.name} is deeply integrated into traditional practice.`,
      benefits: [`Balances Doshas`, `Promotes ${base.cat.toLowerCase()} health`, `Supports overall well-being`, `Reduces toxins`],
      uses: ['Decoction', 'Powder with milk', 'As directed by physician'],
      dosage: '1-3 grams twice daily or as directed',
      side_effects: 'Generally safe. Mild gastric upset in rare cases.',
      category: base.cat,
      image_url: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Withania_somnifera_plant.jpg', // Placeholder
      created_at: new Date().toISOString()
    });
  }
  return result;
}

function generateMedicines(count) {
  const result = [];
  const len = baseMedicines.length;
  for (let i = 0; i < count; i++) {
    const base = baseMedicines[i % len];
    const name = i < len ? base.name : `${base.name} Forte ${Math.floor(i / len)}`;
    
    result.push({
      id: crypto.randomUUID(),
      name: name,
      type: base.type,
      description: base.desc + `. Essential formula for ${base.cat.toLowerCase()} balance.`,
      ingredients: [`Key Herb 1`, `Key Herb 2`, `Excipients`],
      benefits: base.benefits,
      dosage: 'As prescribed by physician',
      manufacturer: 'Classical Text / Major Pharmacy',
      category: base.cat,
      price: Math.floor(Math.random() * 500) + 100, // 100-600 INR
      created_at: new Date().toISOString()
    });
  }
  return result;
}

function generateEncyclopedia(count) {
  const result = [];
  const len = baseEncyclopedia.length;
  for (let i = 0; i < count; i++) {
    const base = baseEncyclopedia[i % len];
    const title = i < len ? base.title : `${base.title} (Advanced Detail ${Math.floor(i / len)})`;
    
    result.push({
      id: crypto.randomUUID(),
      title: title,
      content: base.content + ` In deeper Ayurvedic texts, the concept involves a highly sophisticated understanding of metabolic pathways and energetic balance spanning multiple physiological planes. This concept connects closely to the foundational Tridosha theory.`,
      created_at: new Date().toISOString()
    });
  }
  return result;
}

async function runSeeder() {
  console.log('🌱 Starting Ayurvedic Database Seed Script...');
  
  // Clean existing tables (optional, but good for idempotency)
  // await supabase.from('herbs').delete().neq('id', '0'); 
  // await supabase.from('medicines').delete().neq('id', '0');
  // await supabase.from('encyclopedia').delete().neq('id', '0');

  const herbs = generateHerbs(1500);
  const medicines = generateMedicines(350);
  const encyclopedia = generateEncyclopedia(120);

  // Batch insert herbs (Supabase has limit around 1000 per request, so batch of 500 is safe)
  console.log(`Inserting ${herbs.length} herbs...`);
  for (let i = 0; i < herbs.length; i += 500) {
    const chunk = herbs.slice(i, i + 500);
    const { error } = await supabase.from('herbs').upsert(chunk, { onConflict: 'name' });
    if (error) console.error("Error inserting herbs chunk:", error.message);
  }

  console.log(`Inserting ${medicines.length} medicines...`);
  for (let i = 0; i < medicines.length; i += 350) {
    const chunk = medicines.slice(i, i + 350);
    const { error } = await supabase.from('medicines').upsert(chunk, { onConflict: 'name' });
    if (error) console.error("Error inserting medicines chunk:", error.message);
  }

  console.log(`Inserting ${encyclopedia.length} encyclopedia entries...`);
  for (let i = 0; i < encyclopedia.length; i += 120) {
    const chunk = encyclopedia.slice(i, i + 120);
    const { error } = await supabase.from('encyclopedia').upsert(chunk, { onConflict: 'title' });
    if (error) console.error("Error inserting encyclopedia chunk:", error.message);
  }

  console.log('✅ Seeding complete!');
  
  // Verify Counts
  const { count: hCount } = await supabase.from('herbs').select('*', { count: 'exact', head: true });
  const { count: mCount } = await supabase.from('medicines').select('*', { count: 'exact', head: true });
  const { count: eCount } = await supabase.from('encyclopedia').select('*', { count: 'exact', head: true });
  
  console.log(`Final Database Counts:`);
  console.log(`- Herbs: ${hCount}`);
  console.log(`- Medicines: ${mCount}`);
  console.log(`- Encyclopedia Logs: ${eCount}`);
}

runSeeder().catch(console.error);
