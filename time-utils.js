// Clock and naming helpers: time zones, time differences, short country names.

// Time zone name (like "Asia/Tokyo") for a spot, or null if the lookup library didn't load
function lookupTimeZone(lat, lng) {
    try {
        return typeof tzlookup === 'function' ? tzlookup(lat, lng) : null;
    } catch (error) {
        return null;
    }
}

// Minutes a time zone is ahead of UTC right now (daylight saving included)
function zoneOffsetMinutes(timeZone, date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
    const asUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
    return Math.round((asUtc - date.getTime()) / 60000);
}

function formatClock(date, timeZone) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(date);
}

// "5 h ahead", "2 h 30 min behind", "same time as you"
function describeDifference(minutes) {
    if (minutes === 0) return 'same time as you';
    const total = Math.abs(minutes);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    const amount = [hours ? `${hours} h` : '', mins ? `${mins} min` : ''].filter(Boolean).join(' ');
    return `${amount} ${minutes > 0 ? 'ahead' : 'behind'}`;
}

// "United Kingdom" rather than "United Kingdom of Great Britain and Northern Ireland"
function shortCountryName(code, fallback) {
    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || fallback;
    } catch (error) {
        return fallback;
    }
}
