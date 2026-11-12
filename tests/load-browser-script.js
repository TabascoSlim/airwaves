// Loads one of the site's browser scripts into a sandbox so its plain functions can be tested in Node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function loadBrowserScript(file) {
    const context = vm.createContext({ console, Intl, Date, Math, URL, URLSearchParams });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    return context;
};
