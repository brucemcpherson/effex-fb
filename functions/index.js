const functions = require('firebase-functions');
const efxapiv2 = require('./efxfb');
const efxapisubv2 = require('./efxsub');


// function http entry point for function
exports.api = functions.https.onRequest(efxapiv2.app);

// entry point for watching out for updates
exports.apisub = efxapisubv2.init();

