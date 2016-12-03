/*jslint node: true */
"use strict";
var conf = require('byteballcore/conf.js');
var db = require('byteballcore/db.js');
var eventBus = require('byteballcore/event_bus.js');
var headlessWallet = require('headless-byteball');


headlessWallet.setupChatEventHandlers();


function work(){
	function onError(err){
		throw err;
	}
	var network = require('byteballcore/network.js');
	var walletGeneral = require('byteballcore/wallet_general.js');
	var composer = require('byteballcore/composer.js');
	db.query(
		"SELECT amount, address FROM my_addresses JOIN outputs USING(address) WHERE asset IS NULL AND is_spent=0 ORDER BY amount DESC LIMIT 1",
		function(rows){
			if (rows.length !== 1)
				throw Error("not 1 output");
			var amount = rows[0].amount;
			var address = rows[0].address;
			var chunk_amount = Math.round(amount/100);
			var arrOutputs = [{amount: 0, address: address}];
			for (var i=1; i<100; i++) // 99 iterations
				arrOutputs.push({amount: chunk_amount, address: address});
			console.log(arrOutputs);
			composer.composeAndSavePaymentJoint([address], arrOutputs, headlessWallet.signer, {
				ifNotEnoughFunds: onError,
				ifError: onError,
				ifOk: function(objJoint){
					network.broadcastJoint(objJoint);
				}
			});
		}
	);
}


eventBus.on('headless_wallet_ready', work);
