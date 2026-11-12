const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-browser-script');

const { sunPosition, isDaytime } = load('globe-styles.js');
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);

test('sun is over the equator at the March equinox', () => {
    const sun = sunPosition(new Date('2026-03-20T12:00:00Z'));
    near(sun.lat, 0, 1);
});

test('sun is over the Tropic of Cancer at the June solstice', () => {
    const sun = sunPosition(new Date('2026-06-21T12:00:00Z'));
    near(sun.lat, 23.44, 0.5);
});

test('sun is roughly over Greenwich at 12:00 UTC and over the date line at midnight', () => {
    near(sunPosition(new Date('2026-04-15T12:00:00Z')).lng, 0, 5);
    near(Math.abs(sunPosition(new Date('2026-04-15T00:00:00Z')).lng), 180, 5);
});

test('day and night land where they should', () => {
    const londonNoon = new Date('2026-06-21T12:00:00Z');
    assert.equal(isDaytime(51.5, -0.12, londonNoon), true);   // London at noon
    assert.equal(isDaytime(-33.9, 151.2, londonNoon), false); // Sydney at 10 pm
    assert.equal(isDaytime(78.2, 15.6, new Date('2026-06-21T00:00:00Z')), true);  // Svalbard midnight sun
    assert.equal(isDaytime(78.2, 15.6, new Date('2026-12-21T12:00:00Z')), false); // Svalbard polar night
});
