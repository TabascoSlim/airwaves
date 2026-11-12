// Place facts for the station's location: which city it's in (reverse geocoding)
// and a short Wikipedia summary of that city and its country.

const placeCache = new Map();
const summaryCache = new Map();

// City, region and country for a spot, from BigDataCloud's free reverse geocoder
async function lookupPlace(lat, lng) {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (placeCache.has(key)) return placeCache.get(key);
    const query = new URLSearchParams({ latitude: lat, longitude: lng, localityLanguage: 'en' });
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${query}`);
    if (!response.ok) throw new Error(`Reverse geocode: HTTP ${response.status}`);
    const data = await response.json();
    const place = {
        city: data.city || data.locality || '',
        region: data.principalSubdivision || '',
        country: data.countryName || '',
        countryCode: data.countryCode || '',
    };
    placeCache.set(key, place);
    return place;
}

// A Wikipedia page summary, or null if there's no clear article for that name
async function wikiSummary(title) {
    if (!title) return null;
    if (summaryCache.has(title)) return summaryCache.get(title);
    let summary = null;
    try {
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        if (response.ok) {
            const page = await response.json();
            if (page.type === 'standard' && page.extract) {
                summary = {
                    title: page.title,
                    text: page.extract,
                    image: page.thumbnail ? page.thumbnail.source : null,
                    url: page.content_urls ? page.content_urls.desktop.page : `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
                };
            }
        }
    } catch (error) {
        console.warn('Wikipedia lookup failed for', title, error);
    }
    summaryCache.set(title, summary);
    return summary;
}

// Try the most specific name first ("Springfield, Illinois"), then the plain name
async function citySummary(place) {
    const names = [];
    if (place.city && place.region && place.city !== place.region) names.push(`${place.city}, ${place.region}`);
    if (place.city) names.push(place.city);
    if (place.region) names.push(place.region);
    for (const name of names) {
        const summary = await wikiSummary(name);
        if (summary) return summary;
    }
    return null;
}

// Musicians born near a spot, most famous first (by how many Wikipedias cover them), from Wikidata
const musicianCache = new Map();
const MUSIC_JOBS = [
    'wd:Q639669',  // musician
    'wd:Q177220',  // singer
    'wd:Q36834',   // composer
    'wd:Q2252262', // rapper
    'wd:Q488205',  // singer-songwriter
    'wd:Q855091',  // guitarist
    'wd:Q130857',  // disc jockey
].join(' ');

async function localMusicians(lat, lng, radiusKm = 60) {
    const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
    if (musicianCache.has(key)) return musicianCache.get(key);
    const query = `
        SELECT DISTINCT ?article ?sitelinks WHERE {
            SERVICE wikibase:around {
                ?place wdt:P625 ?location .
                bd:serviceParam wikibase:center "Point(${lng.toFixed(4)} ${lat.toFixed(4)})"^^geo:wktLiteral .
                bd:serviceParam wikibase:radius "${radiusKm}" .
            }
            ?person wdt:P19 ?place ; wdt:P106 ?job ; wikibase:sitelinks ?sitelinks .
            VALUES ?job { ${MUSIC_JOBS} }
            ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> .
        }
        ORDER BY DESC(?sitelinks)
        LIMIT 12`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
        const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
            headers: { Accept: 'application/sparql-results+json' },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Wikidata: HTTP ${response.status}`);
        const data = await response.json();
        const titles = [...new Set(data.results.bindings.map((b) => decodeURIComponent(b.article.value.split('/wiki/')[1]).replace(/_/g, ' ')))];
        musicianCache.set(key, titles);
        return titles;
    } finally {
        clearTimeout(timer);
    }
}

// One famous musician from near the spot, picked at random from the best known few
async function musicianSummary(lat, lng) {
    const titles = await localMusicians(lat, lng);
    const pool = titles.slice(0, 6);
    while (pool.length) {
        const [title] = pool.splice(Math.floor(Math.random() * pool.length), 1);
        const summary = await wikiSummary(title);
        if (summary) return summary;
    }
    return null;
}

// ---- Random facts: one interesting sentence from deeper in a place's Wikipedia article ----

const articleCache = new Map();
const SKIP_SECTIONS = /^(see also|references|notes|external links|further reading|bibliography|sources|citations|footnotes|gallery|list of|twin towns|sister cities|international relations)/i;
const LEANS_ON_CONTEXT = /^(this|these|those|that|it|its|they|their|them|he|his|she|her|such|also|however|moreover|furthermore|additionally|in addition|therefore|thus|meanwhile|later|then|similarly|likewise|instead|still|the (previous|latter|former|same|following|next)|both|another|other)\b/i;
const INTERESTING = /\d|first|oldest|largest|biggest|tallest|longest|only|famous|known for|nicknamed|record|unique|world|invented|founded|named after/i;

// The article's sentences grouped by section, skipping the intro (which the City tab already shows)
async function articleSentences(title) {
    if (articleCache.has(title)) return articleCache.get(title);
    const query = new URLSearchParams({
        action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'wiki',
        redirects: '1', titles: title, format: 'json', origin: '*',
    });
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${query}`);
    if (!response.ok) throw new Error(`Wikipedia: HTTP ${response.status}`);
    const data = await response.json();
    const page = Object.values(data.query.pages)[0];
    const sentences = [];
    if (page && page.extract) {
        let section = null; // null = the intro
        let skipping = false;
        page.extract.split('\n').forEach((line) => {
            const heading = line.match(/^(=+)\s*(.+?)\s*=+$/);
            if (heading) {
                if (heading[1].length === 2) {
                    section = heading[2];
                    skipping = SKIP_SECTIONS.test(section);
                } else if (!skipping) {
                    skipping = SKIP_SECTIONS.test(heading[2]);
                }
                return;
            }
            if (section === null || skipping || line.trim().length < 40) return;
            line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).forEach((sentence) => {
                const text = sentence.trim();
                // Skip sentences that lean on the one before ("However, …", "It was …", "The previous …")
                if (text.length >= 70 && text.length <= 280 && /[.!?]$/.test(text) && !LEANS_ON_CONTEXT.test(text)) {
                    sentences.push({ text, section });
                }
            });
        });
    }
    const result = { title: page ? page.title : title, sentences };
    articleCache.set(title, result);
    return result;
}

// A random interesting fact about the city (or its region, then country)
async function randomPlaceFact(place, countryName) {
    const names = [];
    if (place.city && place.region && place.city !== place.region) names.push(`${place.city}, ${place.region}`);
    if (place.city) names.push(place.city);
    if (place.region) names.push(place.region);
    if (countryName) names.push(countryName);

    for (const name of names) {
        const summary = await wikiSummary(name); // confirms there's a real article under this name
        if (!summary) continue;
        const article = await articleSentences(summary.title);
        if (!article.sentences.length) continue;
        const interesting = article.sentences.filter((s) => INTERESTING.test(s.text));
        const pool = interesting.length >= 3 ? interesting : article.sentences;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return { place: summary.title, fact: pick.text, section: pick.section, url: summary.url, image: summary.image };
    }
    return null;
}
