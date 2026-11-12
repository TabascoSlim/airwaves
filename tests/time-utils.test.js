const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-browser-script');

const { zoneOffsetMinutes, describeDifference, shortCountryName, formatClock } = load('time-utils.js');

test('time zone offsets include daylight saving', () => {
    const winter = new Date('2026-01-15T12:00:00Z');
    const summer = new Date('2026-07-15T12:00:00Z');
    assert.equal(zoneOffsetMinutes('Asia/Tokyo', winter), 540);          // +9, no daylight saving
    assert.equal(zoneOffsetMinutes('Asia/Kolkata', winter), 330);        // +5:30
    assert.equal(zoneOffsetMinutes('America/New_York', winter), -300);   // -5 in winter
    assert.equal(zoneOffsetMinutes('America/New_York', summer), -240);   // -4 in summer
    assert.equal(zoneOffsetMinutes('Australia/Sydney', winter), 660);    // +11 in the southern summer
});

test('time differences read naturally', () => {
    assert.equal(describeDifference(0), 'same time as you');
    assert.equal(describeDifference(300), '5 h ahead');
    assert.equal(describeDifference(-180), '3 h behind');
    assert.equal(describeDifference(570), '9 h 30 min ahead');
    assert.equal(describeDifference(-45), '45 min behind');
});

test('country names come out short', () => {
    assert.equal(shortCountryName('GB', 'United Kingdom of Great Britain and Northern Ireland'), 'United Kingdom');
    assert.equal(shortCountryName('JP', 'Japan'), 'Japan');
});

test('clock shows the station time zone', () => {
    const date = new Date('2026-11-11T23:30:00Z');
    assert.match(formatClock(date, 'Asia/Tokyo'), /8:30/);
});
