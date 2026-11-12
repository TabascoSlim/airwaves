const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const handler = require('../api/now-playing');
const { readStreamTitle, isPublicHost, cleanTitle } = handler;

// A tiny fake radio server: sends `metaint` bytes of "audio", then a metadata block, repeatedly
function fakeStation({ statusLine = 'ICY 200 OK', title = 'Daft Punk - One More Time', metaint = 1000, emptyFirst = false, redirectTo = null, noMeta = false }) {
    const server = net.createServer((socket) => {
        socket.once('data', () => {
            if (redirectTo) {
                socket.end(`HTTP/1.0 302 Found\r\nLocation: ${redirectTo}\r\n\r\n`);
                return;
            }
            const headers = [statusLine, 'content-type: audio/mpeg'];
            if (!noMeta) headers.push(`icy-metaint: ${metaint}`);
            socket.write(`${headers.join('\r\n')}\r\n\r\n`);
            const block = (text) => {
                const raw = Buffer.from(text, 'utf8');
                const length = Math.ceil(raw.length / 16);
                const padded = Buffer.alloc(length * 16);
                raw.copy(padded);
                return Buffer.concat([Buffer.from([length]), padded]);
            };
            const audio = Buffer.alloc(metaint, 0x55);
            const parts = [audio, emptyFirst ? Buffer.from([0]) : block(`StreamTitle='${title}';StreamUrl='';`)];
            if (emptyFirst) parts.push(audio, block(`StreamTitle='${title}';`));
            parts.push(audio);
            socket.write(Buffer.concat(parts));
        });
        socket.on('error', () => {});
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
const urlOf = (server) => `http://127.0.0.1:${server.address().port}/stream`;
const allow = { allowPrivateHosts: true };

test('reads the title from an old-style Shoutcast "ICY 200 OK" stream', async () => {
    const server = await fakeStation({});
    try {
        assert.equal(await readStreamTitle(urlOf(server), 3, allow), 'Daft Punk - One More Time');
    } finally { server.close(); }
});

test('reads the title from a normal HTTP/1.0 Icecast stream', async () => {
    const server = await fakeStation({ statusLine: 'HTTP/1.0 200 OK', title: 'Nujabes - Aruarian Dance' });
    try {
        assert.equal(await readStreamTitle(urlOf(server), 3, allow), 'Nujabes - Aruarian Dance');
    } finally { server.close(); }
});

test('skips an empty first metadata block', async () => {
    const server = await fakeStation({ emptyFirst: true, title: 'Fela Kuti - Water No Get Enemy' });
    try {
        assert.equal(await readStreamTitle(urlOf(server), 3, allow), 'Fela Kuti - Water No Get Enemy');
    } finally { server.close(); }
});

test('keeps non-English titles intact', async () => {
    const server = await fakeStation({ title: '竹内まりや - Plastic Love' });
    try {
        assert.equal(await readStreamTitle(urlOf(server), 3, allow), '竹内まりや - Plastic Love');
    } finally { server.close(); }
});

test('follows a redirect to the real stream', async () => {
    const target = await fakeStation({ title: 'Redirected - Song' });
    const hop = await fakeStation({ redirectTo: urlOf(target) });
    try {
        assert.equal(await readStreamTitle(urlOf(hop), 3, allow), 'Redirected - Song');
    } finally { target.close(); hop.close(); }
});

test('answers null when a stream shares no titles', async () => {
    const server = await fakeStation({ noMeta: true });
    try {
        assert.equal(await readStreamTitle(urlOf(server), 3, allow), null);
    } finally { server.close(); }
});

test('refuses private and local addresses', async () => {
    assert.equal(isPublicHost('localhost'), false);
    assert.equal(isPublicHost('127.0.0.1'), false);
    assert.equal(isPublicHost('192.168.1.20'), false);
    assert.equal(isPublicHost('10.0.0.5'), false);
    assert.equal(isPublicHost('169.254.169.254'), false); // cloud metadata address
    assert.equal(isPublicHost('stream.example.com'), true);
    const server = await fakeStation({});
    try {
        assert.equal(await readStreamTitle(urlOf(server), 3), null); // no test override: blocked
    } finally { server.close(); }
});

test('rejects a request without a valid station id', async () => {
    const res = { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
    await handler({ url: '/api/now-playing?id=../../etc/passwd' }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body, /invalid station id/i);
});

test('drops web addresses and blank titles that some stations send instead of songs', () => {
    assert.equal(cleanTitle('radiovanya.ru'), null);
    assert.equal(cleanTitle('https://www.example.com/live'), null);
    assert.equal(cleanTitle(' - '), null);
    assert.equal(cleanTitle(''), null);
    assert.equal(cleanTitle('Eric Carmen - Hungry Eyes'), 'Eric Carmen - Hungry Eyes');
    assert.equal(cleanTitle('Take this heart / Rea Garvey'), 'Take this heart / Rea Garvey');
    assert.equal(cleanTitle('Mr. Brightside'), 'Mr. Brightside');
});

test('hides ad breaks and raw tag data, and keeps the song from tagged titles', () => {
    // seen live on Airwaves: an ad marker, and an iHeart station ID with raw tags
    assert.equal(cleanTitle('ad|main - Commercial Break - https://prod-54-204-66-137.amperwave.net/ad'), null);
    assert.equal(cleanTitle('Houston\'s Rock & Alternative - text="94-5 The Buzz" song_spot="T" MediaBaseId="0" itunesTrackId="0"'), null);
    // the same tag format on a real song keeps just the song
    assert.equal(cleanTitle('Imagine Dragons - Believer - text="Believer" song_spot="M" MediaBaseId="2410939" itunesTrackId="0"'), 'Imagine Dragons - Believer');
    assert.equal(cleanTitle('Foo Fighters - Everlong - https://station.example.com/now'), 'Foo Fighters - Everlong');
    assert.equal(cleanTitle('Advertisement'), null);
    assert.equal(cleanTitle('Daft Punk - One More Time'), 'Daft Punk - One More Time');
    assert.equal(cleanTitle('AC/DC - Back In Black'), 'AC/DC - Back In Black');
    assert.equal(cleanTitle('Salt-N-Pepa - Push It'), 'Salt-N-Pepa - Push It');
});
