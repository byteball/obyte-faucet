/*jslint node: true */
"use strict";

//exports.port = 6611;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = false;
exports.bIgnoreUnpairRequests = true;

exports.storage = 'sqlite';


exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'Faucet';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = ['DEVICE ALLOWED TO CHAT'];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';

exports.MIN_AMOUNT_IN_KB = 0.5e6;
exports.MAX_AMOUNT_IN_KB = 1e6;

exports.bStaticChangeAddress = true;
exports.MAX_UNSPENT_OUTPUTS = 1;
exports.CONSOLIDATION_INTERVAL = 3600 * 1000;

exports.spend_unconfirmed = 'all';

exports.KEYS_FILENAME = 'keys.json';

console.log('finished faucet conf');
