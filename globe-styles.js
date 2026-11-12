// Airwaves globe: two switchable Earth styles.
//   daynight - photo Earth with a live day side and night side (where the sun is right now)
//   dial     - vintage radio-dial map with cream land and ink borders

const TEXTURES = 'https://unpkg.com/three-globe/example/img/';
const COUNTRIES_URL = 'https://unpkg.com/world-atlas@2/countries-110m.json';
const STYLE_KEY = 'airwaves-globe-style';

const GLOBE_STYLES = {
    daynight: { label: 'Day & Night', accent: '#ffb454', atmosphere: '#7fb4ff' },
    dial: { label: 'Vintage Dial', accent: '#c2410c', atmosphere: '#e9c46a' },
};

// Where on Earth the sun is directly overhead at a given moment.
// Standard solar formulas (declination + equation of time); accurate to a fraction of a degree.
function sunPosition(date = new Date()) {
    const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
    const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86400000);
    const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const g = (2 * Math.PI / 365) * (dayOfYear + (utcHours - 12) / 24);

    const declination = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
        - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
        - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const equationOfTimeMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
        - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));

    let lng = -15 * (utcHours - 12 + equationOfTimeMin / 60);
    lng = ((lng + 540) % 360) - 180;
    return { lat: declination * 180 / Math.PI, lng };
}

// Rough longitude of the viewer, from their clock's time zone (no location permission needed).
function viewerLongitude() {
    return Math.max(-180, Math.min(180, -new Date().getTimezoneOffset() / 4));
}

// Is the sun up at this spot right now?
function isDaytime(lat, lng, date = new Date()) {
    const sun = sunPosition(date);
    const rad = Math.PI / 180;
    const cosAngle = Math.sin(lat * rad) * Math.sin(sun.lat * rad)
        + Math.cos(lat * rad) * Math.cos(sun.lat * rad) * Math.cos((lng - sun.lng) * rad);
    return cosAngle > 0;
}

// Added to the globe's own material: blends the day photo with the night-lights photo
// by how far each point is from the spot where the sun is overhead.
const DAY_NIGHT_GLSL = `
    #ifdef USE_MAP
        float dnLng = (vMapUv.x - 0.5) * 6.283185307;
        float dnLat = (vMapUv.y - 0.5) * 3.141592653;
        float dnSunlight = sin(dnLat) * sin(sun.y) + cos(dnLat) * cos(sun.y) * cos(dnLng - sun.x);
        float dnDay = smoothstep(-0.12, 0.12, dnSunlight);
        vec3 dnNight = texture2D(nightTexture, vMapUv).rgb * 1.6;
        // A thin warm band where day meets night
        float dnDusk = 1.0 - abs(dnDay - 0.5) * 2.0;
        totalEmissiveRadiance = mix(dnNight, diffuseColor.rgb, dnDay) + vec3(0.06, 0.025, 0.0) * dnDusk;
        diffuseColor.rgb = vec3(0.0);
    #endif
`;

class AirwavesGlobe {
    // handlers.onPick({ lat, lng }) runs when someone clicks a spot on the globe;
    // handlers.onStationClick(station) runs when they click a station marker.
    constructor(container, handlers = {}) {
        this.container = container;
        this.handlers = handlers;
        this.stations = [];
        this.active = null;
        this.countries = null;
        this.sunTimer = null;
        this.mapTimer = null;
        this.resumeTimer = null;

        let saved = null;
        try { saved = localStorage.getItem(STYLE_KEY); } catch (e) { /* storage unavailable */ }
        this.style = GLOBE_STYLES[saved] ? saved : 'daynight';

        this.resizeObserver = new ResizeObserver(() => this.fit());
        this.resizeObserver.observe(container);

        // Pointer by default; the grabbing hand only once a press turns into a drag
        let start = null;
        container.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
        container.addEventListener('pointermove', (e) => {
            if (start && e.buttons && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) {
                container.classList.add('is-dragging');
            }
        });
        const release = () => {
            start = null;
            container.classList.remove('is-dragging');
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        this.build();
    }

    get available() {
        return typeof Globe !== 'undefined';
    }

    async setStyle(style) {
        if (!GLOBE_STYLES[style] || style === this.style) return;
        this.style = style;
        try { localStorage.setItem(STYLE_KEY, style); } catch (e) { /* storage unavailable */ }
        await this.build();
    }

    fit() {
        if (this.globe) this.globe.width(this.container.clientWidth).height(this.container.clientHeight);
    }

    async loadCountries() {
        if (this.countries) return this.countries;
        const topo = await fetch(COUNTRIES_URL).then((r) => {
            if (!r.ok) throw new Error(`Country shapes: HTTP ${r.status}`);
            return r.json();
        });
        this.countries = topojson.feature(topo, topo.objects.countries).features
            .filter((f) => f.properties.name !== 'Antarctica');
        return this.countries;
    }

    async build() {
        if (!this.available) {
            this.container.textContent = 'The 3D globe could not load. Check your connection and refresh.';
            return;
        }

        // Keep the camera where it was when switching styles
        const view = this.globe ? this.globe.pointOfView() : { lat: 20, lng: viewerLongitude(), altitude: 2.3 };
        clearInterval(this.sunTimer);
        clearInterval(this.mapTimer);
        clearTimeout(this.resumeTimer);
        if (this.globe && this.globe._destructor) this.globe._destructor();
        this.container.innerHTML = '';

        const look = GLOBE_STYLES[this.style];
        const globe = Globe({ animateIn: false })(this.container)
            .backgroundColor('rgba(0,0,0,0)')
            .showAtmosphere(true)
            .atmosphereColor(look.atmosphere)
            .atmosphereAltitude(0.17)
            .pointLabel('label')
            .pointColor((d) => (d.station === this.active ? look.accent : 'rgba(255,255,255,0.75)'))
            .ringColor(() => (t) => this.ringColor(look.accent, 1 - t))
            .ringMaxRadius(4)
            .ringPropagationSpeed(2)
            .ringRepeatPeriod(1300);
        this.globe = globe;
        this.fit();
        globe.pointOfView(view);
        globe.controls().autoRotate = true;
        globe.controls().autoRotateSpeed = 0.4;

        // A click anywhere (open sea, land, a country shape) asks for stations near that spot
        const pick = (coords) => {
            if (coords && this.handlers.onPick) this.handlers.onPick({ lat: coords.lat, lng: coords.lng });
        };
        globe.onGlobeClick((coords) => pick(coords))
            .onPolygonClick((polygon, event, coords) => pick(coords))
            .onPointClick((point) => {
                if (this.handlers.onStationClick) this.handlers.onStationClick(point.station);
            });

        try {
            if (this.style === 'dial') await this.buildDial(globe);
            else this.buildDayNight(globe);
        } catch (error) {
            console.error('Globe style failed to load, falling back to Day & Night:', error);
            if (this.style !== 'daynight') {
                this.style = 'daynight';
                return this.build();
            }
        }
        this.showStations();
    }

    buildDayNight(globe) {
        globe.globeImageUrl(TEXTURES + 'earth-day.jpg').pointAltitude(0.01).pointRadius(0.45);

        const material = globe.globeMaterial();
        const uniforms = { nightTexture: { value: null }, sun: { value: [0, 0] } }; // sun = [longitude, latitude] in radians
        const moveSun = () => {
            const sun = sunPosition();
            uniforms.sun.value[0] = sun.lng * Math.PI / 180;
            uniforms.sun.value[1] = sun.lat * Math.PI / 180;
        };
        moveSun();
        this.sunTimer = setInterval(moveSun, 60000);

        if (material.specular) material.specular.set('#000000');
        material.onBeforeCompile = (shader) => {
            shader.uniforms.nightTexture = uniforms.nightTexture;
            shader.uniforms.sun = uniforms.sun;
            shader.fragmentShader = 'uniform sampler2D nightTexture;\nuniform vec2 sun;\n'
                + shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + DAY_NIGHT_GLSL);
        };
        material.customProgramCacheKey = () => 'airwaves-day-night';
        material.needsUpdate = true;

        // The night photo becomes a texture of the same kind as the day one, once that has loaded
        const nightImage = new Image();
        nightImage.crossOrigin = 'anonymous';
        nightImage.src = TEXTURES + 'earth-night.jpg';
        let tries = 0;
        this.mapTimer = setInterval(() => {
            tries += 1;
            const ready = material.map && nightImage.complete && nightImage.naturalWidth > 0;
            if (ready) {
                const night = new material.map.constructor(nightImage);
                night.colorSpace = material.map.colorSpace;
                night.needsUpdate = true;
                uniforms.nightTexture.value = night;
            }
            if (ready || tries > 150) clearInterval(this.mapTimer);
        }, 100);
    }

    async buildDial(globe) {
        const countries = await this.loadCountries();
        globe.globeImageUrl(null)
            .polygonsData(countries)
            .polygonCapColor(() => '#efe2c2')
            .polygonSideColor(() => 'rgba(91,58,30,0.25)')
            .polygonStrokeColor(() => '#5b3a1e')
            .polygonAltitude(0.006)
            .polygonLabel(() => '')
            .pointAltitude(0.02)
            .pointRadius(0.5);
        this.paintSphere(globe, '#1f3a4d');
    }

    paintSphere(globe, color) {
        const material = globe.globeMaterial();
        material.color.set(color);
        if ('shininess' in material) material.shininess = 4;
    }

    ringColor(hex, opacity) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
    }

    // Show a set of stations; the active one (playing) gets the accent colour and a pulse.
    // Each station: { lat, lng, label, station } where station is the app's own station object.
    setStations(stations, active) {
        this.stations = stations;
        this.active = active || null;
        this.showStations();
    }

    setActive(active, { focus = true } = {}) {
        this.active = active || null;
        this.showStations();
        const marker = this.stations.find((s) => s.station === this.active);
        if (focus && marker && this.globe) this.focus(marker.lat, marker.lng);
    }

    showStations() {
        if (!this.globe) return;
        const active = this.stations.filter((s) => s.station === this.active);
        // Re-sending the points refreshes their colours
        this.globe.pointsData([...this.stations]).ringsData(active);
    }

    focus(lat, lng) {
        const controls = this.globe.controls();
        controls.autoRotate = false;
        const altitude = Math.min(this.globe.pointOfView().altitude, 2);
        this.globe.pointOfView({ lat, lng, altitude }, 1200);
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 15000);
    }

    // How far the camera is from the surface, in Earth radii (about 2.3 when zoomed all the way out)
    altitude() {
        return this.globe ? this.globe.pointOfView().altitude : 2.3;
    }

    // Stop spinning while someone is browsing a spot
    hold() {
        if (!this.globe) return;
        this.globe.controls().autoRotate = false;
        clearTimeout(this.resumeTimer);
        this.resumeTimer = setTimeout(() => { this.globe.controls().autoRotate = true; }, 15000);
    }
}
