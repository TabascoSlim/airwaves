// Choices for "random station" filters: genre, language and continent.

// Common Radio Browser tags (a tag search matches any station whose tags contain the word)
const GENRES = [
    ['', 'Any genre'],
    ['pop', 'Pop'], ['rock', 'Rock'], ['jazz', 'Jazz'], ['classical', 'Classical'],
    ['hip hop', 'Hip hop'], ['electronic', 'Electronic'], ['dance', 'Dance'], ['house', 'House'],
    ['techno', 'Techno'], ['ambient', 'Ambient'], ['lofi', 'Lo-fi'], ['chillout', 'Chillout'],
    ['country', 'Country'], ['blues', 'Blues'], ['soul', 'Soul'], ['funk', 'Funk'],
    ['reggae', 'Reggae'], ['latin', 'Latin'], ['metal', 'Metal'], ['punk', 'Punk'],
    ['indie', 'Indie'], ['oldies', 'Oldies'], ['80s', '80s'], ['90s', '90s'],
    ['k-pop', 'K-pop'], ['j-pop', 'J-pop'], ['world music', 'World'], ['news', 'News'], ['talk', 'Talk'],
];

// Used if the live language list can't be loaded
const FALLBACK_LANGUAGES = ['english', 'spanish', 'german', 'french', 'portuguese', 'italian', 'japanese', 'korean', 'chinese', 'arabic', 'russian', 'hindi'];

// ISO country codes by continent
const CONTINENTS = {
    Africa: 'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW',
    Asia: 'AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE',
    Europe: 'AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA',
    'North America': 'AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL KN LC MF PM VC SX TT TC US VI',
    'South America': 'AR BO BR CL CO EC FK GF GY PY PE SR UY VE',
    Oceania: 'AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF',
};

function titleCase(text) {
    return text.replace(/\b\w/g, (c) => c.toUpperCase());
}
