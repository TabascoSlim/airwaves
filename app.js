// Airwaves - live radio from around the world on a 3D globe.
//
// app.js wires the page together: searching the Radio Browser directory, playing streams,
// the station list, filters, clocks and the place fact card.
// Other files: globe-styles.js (the globe and its styles), place-facts.js (Wikipedia/Wikidata facts),
// station-filters.js (filter choices), time-utils.js (clocks), country-coordinates.js,
// and api/now-playing.js (the server function that reads song titles from streams).

// How long a station gets to start playing before Airwaves moves on to another one
const STATION_START_TIMEOUT_MS = 8000;

class AirwavesApp {
    constructor() {
        this.audioPlayer = document.getElementById('audio-player');
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.randomStationBtn = document.getElementById('random-station-btn');
        this.stationName = document.getElementById('station-name');
        this.stationCountry = document.getElementById('station-country');
        this.stationGenre = document.getElementById('station-genre');
        this.stationDaylight = document.getElementById('station-daylight');
        this.stationTime = document.getElementById('station-time');
        this.nearbyPanel = document.getElementById('nearby');
        this.nearbyTitle = document.getElementById('nearby-title');
        this.nearbyList = document.getElementById('nearby-list');
        this.factCard = document.getElementById('fact-card');
        this.factBody = document.getElementById('fact-body');
        this.factTabCity = document.getElementById('fact-tab-city');
        this.factTabCountry = document.getElementById('fact-tab-country');
        this.factTabFun = document.getElementById('fact-tab-fun');
        this.muteBtn = document.getElementById('mute-btn');
        this.nowPlaying = document.getElementById('now-playing');
        this.filterBtn = document.getElementById('filter-btn');
        this.filterCard = document.getElementById('filter-card');
        this.filterGenre = document.getElementById('filter-genre');
        this.filterLanguage = document.getElementById('filter-language');
        this.filterContinent = document.getElementById('filter-continent');
        this.filterSummary = document.getElementById('filter-summary');
        this.volumeSlider = document.getElementById('volume-slider');
        this.volumeLevel = document.getElementById('volume-level');
        this.globeContainer = document.getElementById('globe-container');
        this.styleSelect = document.getElementById('style-select');

        this.currentStation = null;
        this.currentTimeZone = null; // IANA zone like "Europe/Paris", or null if unknown
        this.currentCoords = null;
        this.currentPlace = null;    // { city, region, country } from reverse geocoding
        this.factKind = 'city';
        this.nowPlayingTimer = null;
        this.watchdog = null;        // switches away from a station that hasn't started in time
        this.randomMode = false;     // true when the list came from the Random button
        this.autoSkips = 0;          // stops runaway skipping when many stations in a row are down
        this.countryCounts = null;   // { 'FR': 2481, ... } stations per country, for continent picks
        this.stations = [];          // the stations shown on the globe and in the list
        this.searchId = 0;           // ignores a slow search that a newer click replaced
        this.isPlaying = false;

        // Radio Browser API endpoint
        this.apiBaseUrl = 'https://de1.api.radio-browser.info/json';

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.audioPlayer.volume = 0.7;
        this.globe = new AirwavesGlobe(this.globeContainer, {
            onPick: (spot) => this.findNearby(spot),
            onStationClick: (station) => this.selectStation(station),
        });
        this.setupStyleSwitcher();
        this.setupFilters();
        setInterval(() => this.updateClocks(), 1000);
    }

    setupEventListeners() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        this.randomStationBtn.addEventListener('click', () => this.fetchRandomStation());
        this.volumeSlider.addEventListener('input', (e) => this.updateVolume(e.target.value));
        this.muteBtn.addEventListener('click', () => this.setMuted(!this.audioPlayer.muted));

        this.audioPlayer.addEventListener('error', () => this.onAudioError());
        this.audioPlayer.addEventListener('playing', () => {
            clearTimeout(this.watchdog);
            this.autoSkips = 0;
        });

        // Place chip opens a fact card about where the station is
        this.stationCountry.addEventListener('click', () => {
            if (this.factCard.hidden) this.showFacts('city');
            else this.closeFacts();
        });
        this.factTabCity.addEventListener('click', () => this.showFacts('city'));
        this.factTabCountry.addEventListener('click', () => this.showFacts('country'));
        this.factTabFun.addEventListener('click', () => this.showFacts('fun'));
        document.getElementById('fact-close').addEventListener('click', () => this.closeFacts());
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (!this.factCard.hidden) this.closeFacts();
            if (!this.filterCard.hidden) this.closeFilters();
        });
        document.addEventListener('click', (e) => {
            if (!this.factCard.hidden && !this.factCard.contains(e.target) && e.target !== this.stationCountry) this.closeFacts();
            if (!this.filterCard.hidden && !this.filterCard.contains(e.target) && !this.filterBtn.contains(e.target)) this.closeFilters();
        });
        this.audioPlayer.addEventListener('ended', () => this.onAudioEnded());
    }

    // Dropdown of globe styles; the choice is remembered for next time
    setupStyleSwitcher() {
        Object.entries(GLOBE_STYLES).forEach(([key, style]) => {
            this.styleSelect.add(new Option(style.label, key, false, key === this.globe.style));
        });
        this.styleSelect.addEventListener('change', async () => {
            await this.globe.setStyle(this.styleSelect.value);
            this.styleSelect.value = this.globe.style; // in case a style failed and fell back
        });
    }

    // Genre, language and continent filters for the random button
    setupFilters() {
        GENRES.forEach(([value, label]) => this.filterGenre.add(new Option(label, value)));
        this.filterLanguage.add(new Option('Any language', ''));
        FALLBACK_LANGUAGES.forEach((lang) => this.filterLanguage.add(new Option(titleCase(lang), lang)));
        this.filterContinent.add(new Option('Anywhere', ''));
        Object.keys(CONTINENTS).forEach((name) => this.filterContinent.add(new Option(name, name)));

        // Swap in the languages that actually have the most stations
        fetch(`${this.apiBaseUrl}/languages?order=stationcount&reverse=true&limit=40&hidebroken=true`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((languages) => {
                const chosen = this.filterLanguage.value;
                this.filterLanguage.length = 1;
                languages.filter((l) => l.name).forEach((l) => this.filterLanguage.add(new Option(titleCase(l.name), l.name)));
                this.filterLanguage.value = chosen;
            })
            .catch((error) => console.warn('Using the built-in language list:', error));

        [this.filterGenre, this.filterLanguage, this.filterContinent].forEach((select) => {
            select.addEventListener('change', () => this.updateFilterSummary());
        });
        this.filterBtn.addEventListener('click', () => (this.filterCard.hidden ? this.openFilters() : this.closeFilters()));
        document.getElementById('filter-close').addEventListener('click', () => this.closeFilters());
        document.getElementById('filter-clear').addEventListener('click', () => {
            this.filterGenre.value = '';
            this.filterLanguage.value = '';
            this.filterContinent.value = '';
            this.updateFilterSummary();
        });
        document.getElementById('filter-go').addEventListener('click', () => {
            this.closeFilters();
            this.fetchRandomStation();
        });
    }

    openFilters() {
        this.closeFacts();
        const controls = this.filterBtn.closest('.audio-controls');
        this.filterCard.style.bottom = `${controls.offsetHeight + 12}px`;
        this.filterCard.hidden = false;
        this.filterBtn.setAttribute('aria-expanded', 'true');
        this.filterGenre.focus();
    }

    closeFilters() {
        this.filterCard.hidden = true;
        this.filterBtn.setAttribute('aria-expanded', 'false');
    }

    updateFilterSummary() {
        const pick = (select) => (select.selectedIndex >= 0 ? select.options[select.selectedIndex].text : '');
        this.filterSummary.textContent = `${pick(this.filterGenre)} · ${pick(this.filterLanguage)} · ${pick(this.filterContinent)}`;
        const active = [this.filterGenre, this.filterLanguage, this.filterContinent].filter((s) => s.value).length;
        this.filterBtn.textContent = active ? `Filters (${active})` : 'Filters';
        this.filterSummary.hidden = active === 0; // only worth the space when something is set
    }

    // Stations per country, so continent picks favour countries that have stations
    async loadCountryCounts() {
        if (this.countryCounts) return this.countryCounts;
        const response = await fetch(`${this.apiBaseUrl}/countries?hidebroken=true`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const countries = await response.json();
        this.countryCounts = {};
        countries.forEach((c) => {
            if (c.iso_3166_1) this.countryCounts[c.iso_3166_1.toUpperCase()] = (this.countryCounts[c.iso_3166_1.toUpperCase()] || 0) + c.stationcount;
        });
        return this.countryCounts;
    }

    // A random country on the continent, weighted by how many stations it has
    async pickCountry(continent, skip) {
        const counts = await this.loadCountryCounts();
        const options = CONTINENTS[continent].split(' ').filter((code) => counts[code] && !skip.has(code));
        const total = options.reduce((sum, code) => sum + counts[code], 0);
        let roll = Math.random() * total;
        for (const code of options) {
            roll -= counts[code];
            if (roll <= 0) return code;
        }
        return options[options.length - 1] || null;
    }

    // A random station from the list that isn't the one already playing
    pickNew(stations) {
        const current = this.currentStation && this.currentStation.stationuuid;
        const fresh = stations.filter((s) => s.stationuuid !== current && s.name && (s.url_resolved || s.url));
        const pool = fresh.length ? fresh : stations;
        return pool[Math.floor(Math.random() * pool.length)] || null;
    }

    // Base search: working stations with coordinates that stream over https
    // (pass a param as null to drop it, e.g. has_geo_info: null to include stations without coordinates)
    stationSearch(params) {
        const merged = { hidebroken: 'true', has_geo_info: 'true', is_https: 'true', ...params };
        Object.keys(merged).forEach((key) => merged[key] == null && delete merged[key]);
        const query = new URLSearchParams(merged);
        return fetch(`${this.apiBaseUrl}/stations/search?${query}`).then((response) => {
            if (!response.ok) throw new Error(`Station search: HTTP ${response.status}`);
            return response.json();
        });
    }

    async fetchRandomStation() {
        const search = ++this.searchId;
        // The directory caches identical requests, so a fresh random tag makes every press a new draw.
        // Asking for 10 lets us skip the station that's already playing.
        const params = { limit: '10', order: 'random' };
        if (this.filterGenre.value) params.tag = this.filterGenre.value;
        if (this.filterLanguage.value) params.language = this.filterLanguage.value;
        const continent = this.filterContinent.value;

        try {
            this.setLoadingState(true);
            let station = null;
            if (continent) {
                // The directory can't search by continent, so try a few of its countries
                const tried = new Set();
                for (let attempt = 0; attempt < 6 && !station; attempt += 1) {
                    const code = await this.pickCountry(continent, tried);
                    if (!code) break;
                    tried.add(code);
                    station = this.pickNew(await this.stationSearch({ ...params, countrycode: code, nocache: Math.random().toString(36).slice(2) }));
                }
            } else {
                station = this.pickNew(await this.stationSearch({ ...params, nocache: Math.random().toString(36).slice(2) }));
            }
            if (search !== this.searchId) return;
            if (!station) {
                this.showError('No station matches those filters. Try loosening one.');
                return;
            }
            this.showStations([station], 'Random pick');
            this.randomMode = true;
            this.selectStation(station);
        } catch (error) {
            console.error('Error fetching random station:', error);
            this.showError('Failed to fetch station. Please try again.');
        } finally {
            this.setLoadingState(false);
        }
    }

    // Stations near a clicked spot. Many stations don't list exact coordinates (only 3 of Japan's
    // ~90 do), so this combines two searches: stations with coordinates near the spot, and every
    // station registered in the country that was clicked.
    async findNearby({ lat, lng }) {
        const search = ++this.searchId;
        this.globe.hold();
        this.nearbyPanel.hidden = false;
        this.nearbyTitle.textContent = 'Nearby stations';
        this.nearbyList.innerHTML = '<li class="nearby-status">Searching the airwaves…</li>';

        // Zoomed in = a tighter search circle, more results, and the closest stations first
        const altitude = this.globe.altitude();
        const zoomedIn = altitude < 1;

        try {
            const [place, nearby] = await Promise.all([
                lookupPlace(lat, lng).catch(() => null),
                this.searchByDistance(lat, lng, altitude),
            ]);
            if (search !== this.searchId) return; // a newer click took over

            const code = place && place.countryCode ? place.countryCode.toUpperCase() : '';
            let national = [];
            if (code) {
                national = await this.stationSearch({
                    countrycode: code, has_geo_info: null, limit: '40', order: 'clickcount', reverse: 'true',
                });
                if (search !== this.searchId) return;
            }

            // Order: nearby stations in the clicked country, the rest of that country, then nearby neighbours
            const seen = new Set();
            const add = (list, station) => {
                if (!station.name || !(station.url_resolved || station.url) || seen.has(station.stationuuid)) return;
                seen.add(station.stationuuid);
                list.push(station);
            };
            const ordered = [];
            national.forEach((s) => {
                // No coordinates listed: place it where the person clicked, inside the right country
                if (!this.hasOwnCoordinates(s)) s.approxCoords = { lat, lng };
            });
            if (zoomedIn) {
                // Close-up: everything with a location near the spot, nearest first, then the rest of the country
                nearby.stations.forEach((s) => add(ordered, s));
                national.forEach((s) => add(ordered, s));
            } else {
                nearby.stations.filter((s) => (s.countrycode || '').toUpperCase() === code).forEach((s) => add(ordered, s));
                national.forEach((s) => add(ordered, s));
                nearby.stations.forEach((s) => add(ordered, s));
            }

            if (!ordered.length) {
                this.nearbyList.innerHTML = '<li class="nearby-status">No stations out here. Try clicking closer to land.</li>';
                return;
            }
            const title = zoomedIn && nearby.stations.length
                ? `Stations within ${nearby.km.toLocaleString()} km`
                : code && national.length
                    ? `Stations in and around ${shortCountryName(code, place.country)}`
                    : `Stations within ${nearby.km.toLocaleString()} km`;
            this.showStations(ordered.slice(0, 50), title);
            this.randomMode = false;
            this.autoSkips = 0;
            this.selectStation(ordered[0]);
        } catch (error) {
            if (search !== this.searchId) return;
            console.error('Error finding nearby stations:', error);
            this.nearbyList.innerHTML = '<li class="nearby-status">Couldn\'t reach the station directory. Try again.</li>';
        }
    }

    // Stations with coordinates near a spot: widen the circle until there are a handful.
    // The starting circle follows the zoom: about 100 km zoomed out, down to 25 km up close.
    async searchByDistance(lat, lng, altitude = 2.3) {
        const zoomedIn = altitude < 1;
        const startKm = Math.round(Math.min(100, Math.max(25, altitude * 60)));
        const radiiKm = [startKm, startKm * 3, startKm * 10, 3000].filter((km, i, all) => km <= 3000 && all.indexOf(km) === i);
        const limit = zoomedIn ? '40' : '15';
        let best = { stations: [], km: radiiKm[0] };
        for (const km of radiiKm) {
            const stations = await this.stationSearch({
                geo_lat: lat.toFixed(4),
                geo_long: lng.toFixed(4),
                geo_distance: String(km * 1000),
                limit,
                order: 'clickcount',
                reverse: 'true',
            });
            if (stations.length > best.stations.length) best = { stations, km };
            if (best.stations.length >= (zoomedIn ? 10 : 6)) break;
        }
        if (zoomedIn) best.stations.sort((a, b) => Number(a.geo_distance) - Number(b.geo_distance));
        return best;
    }

    hasOwnCoordinates(station) {
        return station.geo_lat != null && station.geo_long != null
            && Number.isFinite(Number(station.geo_lat)) && Number.isFinite(Number(station.geo_long));
    }

    // Put a set of stations on the globe and in the list
    showStations(stations, title) {
        this.stations = stations;
        this.nearbyPanel.hidden = false;
        this.nearbyTitle.textContent = title;
        this.nearbyList.innerHTML = '';

        stations.forEach((station) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'nearby-item';
            const name = document.createElement('span');
            name.className = 'nearby-name';
            name.textContent = station.name.trim();
            const meta = document.createElement('span');
            meta.className = 'nearby-meta';
            const km = Number(station.geo_distance) / 1000;
            const where = (station.countrycode || '').toUpperCase();
            const distance = station.geo_distance != null && Number.isFinite(km) && this.hasOwnCoordinates(station)
                ? `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km`
                : '';
            meta.textContent = [distance, where].filter(Boolean).join(' · ') || station.country || '';
            button.append(name, meta);
            button.addEventListener('click', () => this.selectStation(station));
            station.listButton = button;
            item.appendChild(button);
            this.nearbyList.appendChild(item);
        });

        const markers = stations
            .map((station) => {
                const coords = this.stationCoordinates(station);
                return coords && { ...coords, label: station.name.trim(), station };
            })
            .filter(Boolean);
        this.globe.setStations(markers, null);
    }

    selectStation(station) {
        this.loadStation(station);
        this.play();
        // If the stream hasn't started in time, move on to another station
        // (the 'playing' event cancels this; so does pausing, or the browser blocking autoplay)
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => {
            if (station === this.currentStation && !this.audioPlayer.blockedByBrowser) this.skipUnreachable(station);
        }, STATION_START_TIMEOUT_MS);
        this.globe.setActive(station);
        this.stations.forEach((s) => {
            if (s.listButton) s.listButton.setAttribute('aria-current', String(s === station));
        });
        if (station.listButton) station.listButton.scrollIntoView({ block: 'nearest' });
    }

    loadStation(station) {
        this.currentStation = station;

        this.stationName.textContent = station.name.trim() || 'Unknown Station';
        this.stationCountry.textContent = `📍 ${station.country || 'Unknown country'}`;
        this.stationCountry.disabled = false;
        const tags = (station.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
        this.stationGenre.textContent = tags.join(', ');
        this.closeFacts();

        this.audioPlayer.src = station.url_resolved || station.url;
        this.audioPlayer.load();
        this.playPauseBtn.disabled = false;

        this.currentCoords = this.stationCoordinates(station);
        this.currentTimeZone = this.currentCoords ? lookupTimeZone(this.currentCoords.lat, this.currentCoords.lng) : null;
        this.updateClocks();
        this.loadPlace(station);
        this.watchNowPlaying(station);
    }

    // Ask our /api/now-playing function what's on, now and every 20 seconds.
    // Many stations don't share it; then the line stays hidden.
    watchNowPlaying(station) {
        clearInterval(this.nowPlayingTimer);
        this.nowPlaying.hidden = true;
        this.nowPlaying.textContent = '';
        if (!station.stationuuid) return;

        let misses = 0;
        const check = async () => {
            try {
                const response = await fetch(`/api/now-playing?id=${encodeURIComponent(station.stationuuid)}`);
                if (station !== this.currentStation) return;
                if (response.status === 404 && !response.headers.get('content-type')?.includes('json')) {
                    clearInterval(this.nowPlayingTimer); // no server function here (plain static server)
                    return;
                }
                const { title } = await response.json();
                if (station !== this.currentStation) return;
                if (title) {
                    misses = 0;
                    this.nowPlaying.textContent = `🎵 ${title}`;
                    this.nowPlaying.title = title;
                    this.nowPlaying.hidden = false;
                } else if (++misses >= 3 && this.nowPlaying.hidden) {
                    clearInterval(this.nowPlayingTimer); // this station doesn't share titles
                }
            } catch (error) {
                clearInterval(this.nowPlayingTimer);
            }
        };
        check();
        this.nowPlayingTimer = setInterval(check, 20000);
    }

    // Name the city the station is in, for the place chip and its fact card
    async loadPlace(station) {
        this.currentPlace = null;
        if (!this.currentCoords) return;
        try {
            const place = await lookupPlace(this.currentCoords.lat, this.currentCoords.lng);
            if (station !== this.currentStation) return;
            this.currentPlace = place;
            const country = place.countryCode
                ? shortCountryName(place.countryCode.toUpperCase(), place.country)
                : place.country || station.country || 'Unknown country';
            this.stationCountry.textContent = place.city ? `📍 ${place.city}, ${country}` : `📍 ${country}`;
        } catch (error) {
            console.warn('Could not name the station\'s city:', error);
        }
    }

    async showFacts(kind) {
        if (!this.currentStation) return;
        this.closeFilters();
        const place = this.currentPlace || {};
        this.factKind = kind;
        // Open just under the station card so the chips stay visible
        this.factCard.style.top = `${document.getElementById('station-info').offsetHeight + 8}px`;
        this.factCard.hidden = false;
        this.stationCountry.setAttribute('aria-expanded', 'true');
        this.factTabCity.setAttribute('aria-selected', String(kind === 'city'));
        this.factTabCountry.setAttribute('aria-selected', String(kind === 'country'));
        this.factTabFun.setAttribute('aria-selected', String(kind === 'fun'));
        this.factBody.innerHTML = '<p class="fact-status">Looking it up…</p>';

        const station = this.currentStation;
        const coords = this.currentCoords;
        let summary = null;
        let note = '';
        try {
            if (kind === 'country') {
                summary = await wikiSummary(place.country || station.country);
            } else if (kind === 'city') {
                // City, then its region; if neither has an article, a musician from the area
                summary = await citySummary(place);
                if (!summary && coords) {
                    this.factBody.innerHTML = '<p class="fact-status">No article for this town, so finding a local musician…</p>';
                    summary = await musicianSummary(coords.lat, coords.lng);
                    if (summary) note = 'No article about this town, so here is a musician from the area.';
                }
            } else {
                // One interesting sentence from deeper in the place's article; a local musician if there's none
                const fact = await randomPlaceFact(place, place.country || station.country);
                if (fact) {
                    summary = { title: fact.place, text: fact.fact, image: fact.image, url: fact.url };
                    note = `From the ${fact.section} section`;
                } else if (coords) {
                    this.factBody.innerHTML = '<p class="fact-status">Finding a musician from around here…</p>';
                    summary = await musicianSummary(coords.lat, coords.lng);
                    if (summary) note = 'Famous musician from the area';
                }
            }
        } catch (error) {
            console.warn('Fact lookup failed:', error);
        }
        if (station !== this.currentStation || kind !== this.factKind || this.factCard.hidden) return;

        this.factBody.innerHTML = '';
        if (!summary) {
            this.factBody.innerHTML = '<p class="fact-status">No encyclopedia entry found for this place.</p>';
            return;
        }
        if (summary.image) {
            const img = document.createElement('img');
            img.className = 'fact-image';
            img.src = summary.image;
            img.alt = '';
            this.factBody.appendChild(img);
        }
        const text = document.createElement('div');
        const title = document.createElement('h3');
        title.className = 'fact-title';
        title.id = 'fact-title';
        title.textContent = summary.title;
        const body = document.createElement('p');
        body.className = 'fact-text';
        body.textContent = summary.text;
        const link = document.createElement('a');
        link.className = 'fact-link';
        link.href = summary.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Read more on Wikipedia';
        if (note) {
            const tag = document.createElement('p');
            tag.className = 'fact-note';
            tag.textContent = note;
            text.append(tag);
        }
        text.append(title, body);
        if (kind === 'fun') {
            const again = document.createElement('button');
            again.type = 'button';
            again.className = 'fact-again';
            again.textContent = 'Another fact';
            again.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showFacts('fun');
            });
            text.append(again);
        }
        text.append(link);
        this.factBody.appendChild(text);
    }

    closeFacts() {
        this.factCard.hidden = true;
        this.stationCountry.setAttribute('aria-expanded', 'false');
    }

    // Where the station is: its own coordinates if it has them, else the middle of its country
    stationCoordinates(station) {
        if (this.hasOwnCoordinates(station)) return { lat: Number(station.geo_lat), lng: Number(station.geo_long) };
        return station.approxCoords || COUNTRY_COORDINATES[station.country] || null;
    }

    // The station's local time, and how far it is from the visitor's own clock
    updateClocks() {
        if (!this.currentStation || !this.currentCoords) {
            this.stationTime.textContent = '';
            this.stationDaylight.textContent = '';
            return;
        }
        const now = new Date();
        const { lat, lng } = this.currentCoords;
        this.stationDaylight.textContent = isDaytime(lat, lng, now) ? '☀️ Daytime there' : '🌙 Night there';

        const zone = this.currentTimeZone;
        // Without a known zone, estimate from longitude (15° per hour)
        const theirOffset = zone ? zoneOffsetMinutes(zone, now) : Math.round(lng / 15) * 60;
        const yourOffset = -now.getTimezoneOffset();
        const theirTime = zone
            ? formatClock(now, zone)
            : formatClock(new Date(now.getTime() + (theirOffset - yourOffset) * 60000));

        this.stationTime.textContent = `🕒 ${zone ? '' : '≈ '}${theirTime} there · ${describeDifference(theirOffset - yourOffset)}`;
    }

    togglePlayPause() {
        if (!this.currentStation) return;
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    async play() {
        this.audioPlayer.blockedByBrowser = false;
        try {
            await this.audioPlayer.play();
            this.isPlaying = true;
            this.updatePlayPauseButton();
        } catch (error) {
            // Browsers block sound until the visitor has clicked something; the Play button still works
            if (error.name === 'NotAllowedError') {
                this.audioPlayer.blockedByBrowser = true;
                clearTimeout(this.watchdog);
                return;
            }
            if (error.name === 'AbortError') return; // a newer station replaced this one
            console.error('Error playing audio:', error);
            this.showError('Failed to play station. The stream might be unavailable.');
        }
    }

    pause() {
        clearTimeout(this.watchdog);
        this.audioPlayer.pause();
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }

    updateVolume(value) {
        this.audioPlayer.volume = value / 100;
        this.volumeLevel.textContent = `${value}%`;
        if (this.audioPlayer.muted && Number(value) > 0) this.setMuted(false);
    }

    setMuted(muted) {
        this.audioPlayer.muted = muted;
        this.muteBtn.textContent = muted ? '🔇' : '🔊';
        this.muteBtn.setAttribute('aria-pressed', String(muted));
        this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
        this.volumeLevel.textContent = muted ? 'Muted' : `${this.volumeSlider.value}%`;
    }

    updatePlayPauseButton() {
        const btnIcon = this.playPauseBtn.querySelector('.btn-icon');
        const btnText = this.playPauseBtn.querySelector('.btn-text');
        btnIcon.textContent = this.isPlaying ? '⏸️' : '▶️';
        btnText.textContent = this.isPlaying ? 'Pause' : 'Play';
    }

    setLoadingState(isLoading) {
        this.randomStationBtn.classList.toggle('loading', isLoading);
        this.randomStationBtn.disabled = isLoading;
    }

    showNotice(message) {
        this.showError(message, 'var(--background-light)');
    }

    showError(message, background = 'var(--error-color)') {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.setAttribute('role', 'alert');
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${background};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
    }

    onAudioError() {
        if (!this.currentStation || !this.audioPlayer.getAttribute('src')) return;
        this.skipUnreachable(this.currentStation);
    }

    // The station can't be reached: try the next one in the list (or a new random pick)
    skipUnreachable(station) {
        clearTimeout(this.watchdog);
        if (station !== this.currentStation) return;
        station.unreachable = true;
        this.isPlaying = false;
        this.updatePlayPauseButton();
        if (station.listButton) station.listButton.classList.add('is-unreachable');

        this.autoSkips += 1;
        if (this.autoSkips > 6) {
            this.autoSkips = 0;
            this.showError('Several stations in a row were off the air. Pick another spot or try Random again.');
            return;
        }
        const index = this.stations.indexOf(station);
        const next = [...this.stations.slice(index + 1), ...this.stations.slice(0, Math.max(index, 0))]
            .find((s) => !s.unreachable);
        this.showNotice(`${station.name.trim()} isn't reachable right now. Switching stations…`);
        if (next) {
            this.selectStation(next);
        } else if (this.randomMode) {
            this.fetchRandomStation();
        } else {
            this.showError('None of these stations are reachable right now.');
        }
    }

    onAudioEnded() {
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.airwavesApp = new AirwavesApp();

    // Keyboard shortcuts: Space plays or pauses, Ctrl+R picks a random station
    document.addEventListener('keydown', (e) => {
        const typing = ['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
        if (e.code === 'Space' && !typing) {
            e.preventDefault();
            window.airwavesApp.togglePlayPause();
        } else if (e.code === 'KeyR' && e.ctrlKey) {
            e.preventDefault();
            window.airwavesApp.fetchRandomStation();
        }
    });
});
