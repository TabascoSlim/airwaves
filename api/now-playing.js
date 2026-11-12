// GET /api/now-playing?id=<Radio Browser station id>
// Answers { title: "Artist - Song" } when the station's stream says what's playing, else { title: null }.
//
// Many internet radio streams (Shoutcast/Icecast) tuck the song title into the audio itself every few
// kilobytes ("ICY metadata"). Browsers can't read it, so this server-side function connects to the stream,
// reads just far enough to find the title, and hangs up.
//
// It takes a station id, not a URL: the stream address is looked up from Radio Browser here,
// so nobody can use this function to make the server fetch arbitrary addresses.

const net = require('net');
const tls = require('tls');

const RADIO_BROWSER = 'https://de1.api.radio-browser.info/json';
const TIMEOUT_MS = 7000;
const MAX_BYTES = 512 * 1024;

module.exports = async function handler(req, res) {
    const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return send(res, 400, { error: 'Missing or invalid station id' });

    try {
        const lookup = await fetch(`${RADIO_BROWSER}/stations/byuuid/${id}`, { headers: { 'User-Agent': 'Airwaves/1.0' } });
        const [station] = lookup.ok ? await lookup.json() : [];
        if (!station) return send(res, 404, { error: 'Unknown station' });
        const title = await readStreamTitle(station.url_resolved || station.url, 3);
        send(res, 200, { title });
    } catch (error) {
        send(res, 200, { title: null });
    }
};

function send(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    // Let Vercel's edge cache answer repeat requests for 15 seconds
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.end(JSON.stringify(body));
}

// Some stations put their web address or a slogan where the song goes; only keep real-looking titles
function cleanTitle(title) {
    const text = (title || '').trim();
    if (!text || /^[-–—\s]+$/.test(text)) return null;
    if (/^(https?:\/\/)?(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text)) return null; // just a web address
    return text;
}

// Refuse local and private-network addresses
function isPublicHost(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (net.isIP(host) === 4) {
        const [a, b] = host.split('.').map(Number);
        return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
    }
    if (net.isIP(host) === 6) return !(host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'));
    return true;
}

// Connects with a raw socket so old Shoutcast servers (which answer "ICY 200 OK" instead of HTTP) still work
function readStreamTitle(address, redirectsLeft, options = {}) {
    return new Promise((resolve) => {
        let url;
        try {
            url = new URL(address);
        } catch (error) {
            return resolve(null);
        }
        if (!/^https?:$/.test(url.protocol)) return resolve(null);
        // allowPrivateHosts is only for the automated tests, which run a fake station on this machine
        if (!options.allowPrivateHosts && !isPublicHost(url.hostname)) return resolve(null);

        const secure = url.protocol === 'https:';
        const port = Number(url.port) || (secure ? 443 : 80);
        const target = { host: url.hostname, port, servername: net.isIP(url.hostname) ? undefined : url.hostname };
        const socket = secure ? tls.connect(target) : net.connect(target);

        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            socket.destroy();
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), TIMEOUT_MS);

        socket.on(secure ? 'secureConnect' : 'connect', () => {
            // HTTP/1.0 keeps the reply unchunked, so metadata offsets count straight bytes
            socket.write(
                `GET ${url.pathname}${url.search} HTTP/1.0\r\n` +
                `Host: ${url.host}\r\n` +
                'Icy-MetaData: 1\r\n' +
                'User-Agent: Airwaves/1.0\r\n' +
                'Connection: close\r\n\r\n'
            );
        });

        let buffer = Buffer.alloc(0);
        let metaint = null;
        let bodyStart = -1;

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            if (buffer.length > MAX_BYTES) return finish(null);

            if (bodyStart < 0) {
                const end = buffer.indexOf('\r\n\r\n');
                if (end < 0) return;
                const lines = buffer.slice(0, end).toString('latin1').split('\r\n');
                const status = Number((lines[0].split(' ')[1]) || 0);
                const headers = {};
                lines.slice(1).forEach((line) => {
                    const i = line.indexOf(':');
                    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
                });
                if (status >= 300 && status < 400 && headers.location && redirectsLeft > 0) {
                    const next = new URL(headers.location, url).toString();
                    done = true;
                    clearTimeout(timer);
                    socket.destroy();
                    return readStreamTitle(next, redirectsLeft - 1, options).then(resolve);
                }
                metaint = Number(headers['icy-metaint']);
                if (!(status >= 200 && status < 300) || !metaint || metaint > 128 * 1024) return finish(null);
                bodyStart = end + 4;
            }

            // Metadata sits after every `metaint` audio bytes: 1 length byte (x16), then the text.
            // The first block can be empty, so look at up to three.
            let offset = bodyStart;
            for (let block = 0; block < 3; block += 1) {
                const lengthAt = offset + metaint;
                if (buffer.length <= lengthAt) return;
                const length = buffer[lengthAt] * 16;
                if (buffer.length < lengthAt + 1 + length) return;
                if (length > 0) {
                    const text = buffer.slice(lengthAt + 1, lengthAt + 1 + length).toString('utf8').replace(/\0+$/, '');
                    const match = text.match(/StreamTitle='(.*?)';/s);
                    const title = match ? match[1].trim() : '';
                    return finish(cleanTitle(title));
                }
                offset = lengthAt + 1;
            }
            finish(null);
        });

        socket.on('error', () => finish(null));
        socket.on('end', () => finish(null));
    });
}

// Exposed for the automated tests
module.exports.readStreamTitle = readStreamTitle;
module.exports.isPublicHost = isPublicHost;
module.exports.cleanTitle = cleanTitle;
