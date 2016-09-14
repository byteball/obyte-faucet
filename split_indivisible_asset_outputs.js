/*jslint node: true */
"use strict";
var _ = require('byteballcore/node_modules/lodash');
var headlessWallet = require('./start.js');
var eventBus = require('byteballcore/event_bus.js');
var objectHash = require('byteballcore/object_hash.js');
var db = require('byteballcore/db.js');
var storage = require('byteballcore/storage.js');

const asset = 'JY4RvlUGv0qWItikizmNOIjIYZeEciODOog8AzLju50=';

function onError(err){
	throw Error(err);
}

function splitOutputOnAddresses(objAsset, arrAddresses){
	var composer = require('byteballcore/composer.js');
	var network = require('byteballcore/network.js');
	var indivisibleAsset = require('byteballcore/indivisible_asset.js');
	
	function createOutputs(address, amount_to_use, change_amount){
		var output = {
			address: address,
			amount: amount_to_use
		};
		if (objAsset.is_private)
			output.blinding = composer.generateBlinding();
		var outputs = [output];
		if (change_amount){
			var change_output = {
				address: address,
				amount: change_amount
			};
			if (objAsset.is_private)
				change_output.blinding = composer.generateBlinding();
			outputs.push(change_output);
			outputs.sort(function(o1, o2){ return (o1.address < o2.address) ? -1 : 1; });
		}
		return outputs;
	}

	function pickCoins(conn, last_ball_mci, bMultiAuthored, onDone){
		var arrPayloadsWithProofs = [];
		conn.query(
			"SELECT unit, message_index, output_index, amount, denomination, address, blinding \n\
			FROM outputs JOIN units USING(unit) \n\
			WHERE asset=? AND address IN(?) AND is_serial=1 AND is_spent=0 AND sequence='good' \n\
				AND main_chain_index<=? AND is_stable=1 AND amount>=2*denomination",
			[asset, arrAddresses, last_ball_mci],
			function(rows){
				if (rows.length === 0)
					throw Error("no spendable outputs");
				console.log('rows: ', rows);
				rows.forEach(function(row){
					var input = {
						unit: row.unit,
						message_index: row.message_index,
						output_index: row.output_index
					};
					var amount_to_use = Math.ceil(row.amount/2.0/row.denomination) * row.denomination;
					var change_amount = row.amount - amount_to_use;
					var payload = {
						asset: asset,
						denomination: row.denomination,
						inputs: [input],
						outputs: createOutputs(row.address, amount_to_use, change_amount)
					};
					var objPayloadWithProof = {payload: payload, input_address: row.address};
					if (objAsset.is_private){
						var spend_proof = objectHash.getBase64Hash({
							asset: asset,
							unit: row.unit,
							message_index: row.message_index,
							output_index: row.output_index,
							address: row.address,
							amount: row.amount,
							blinding: row.blinding
						});
						var objSpendProof = {
							spend_proof: spend_proof
						};
						if (bMultiAuthored)
							objSpendProof.address = row.address;
						objPayloadWithProof.spend_proof = objSpendProof;
					}
					arrPayloadsWithProofs.push(objPayloadWithProof);
				});
				console.log('arrPayloadsWithProofs', require('util').inspect(arrPayloadsWithProofs, {depth:null}));
				onDone(arrPayloadsWithProofs);
			}
		);
	}

	composer.composeJoint({
		paying_addresses: arrAddresses,
		outputs: [{address: arrAddresses[0], amount: 0}],
		retrieveMessages: function createAdditionalMessages(conn, last_ball_mci, bMultiAuthored, arrPayingAddresses, onDone){
			pickCoins(conn, last_ball_mci, bMultiAuthored, function(arrPayloadsWithProofs){
				var arrMessages = [];
				var assocPrivatePayloads = {};
				for (var i=0; i<arrPayloadsWithProofs.length; i++){
					var payload = arrPayloadsWithProofs[i].payload;
					var payload_hash = objectHash.getBase64Hash(payload);
					if (objAsset.is_private){
						payload.outputs.forEach(function(o){
							o.output_hash = objectHash.getBase64Hash({address: o.address, blinding: o.blinding});
						});
						var hidden_payload = _.cloneDeep(payload);
						hidden_payload.outputs.forEach(function(o){
							delete o.address;
							delete o.blinding;
						});
						payload_hash = objectHash.getBase64Hash(hidden_payload);
					}
					else
						payload_hash = objectHash.getBase64Hash(payload);
					var objMessage = {
						app: "payment",
						payload_location: objAsset.is_private ? "none" : "inline",
						payload_hash: payload_hash
					};
					if (objAsset.is_private){
						assocPrivatePayloads[payload_hash] = payload;
						objMessage.spend_proofs = [arrPayloadsWithProofs[i].spend_proof];
					}
					else
						objMessage.payload = payload;
					arrMessages.push(objMessage);
				}
				console.log("composed messages "+JSON.stringify(arrMessages));
				//process.exit();
				onDone(null, arrMessages, assocPrivatePayloads);
			});
		},
		signer: headlessWallet.signer, 
		callbacks: indivisibleAsset.getSavingCallbacks(arrAddresses[0], {
			ifError: onError,
			ifNotEnoughFunds: onError,
			ifOk: function(objJoint, arrRecipientChains, arrCosignerChains){
				// the private chains belong to us, no need to send anywhere
				network.broadcastJoint(objJoint);
			}
		})
	});
}

function splitOutputs(){
	db.query("SELECT DISTINCT address FROM my_addresses JOIN outputs USING(address) WHERE is_spent=0 AND is_serial=1 AND asset=?", [asset], function(rows){
		if (rows.length === 0)
			throw Error("no addresses");
		var arrAddresses = rows.map(function(row){ return row.address; });
		console.log('addresses: ', arrAddresses);
		storage.readAsset(db, asset, null, function(err, objAsset){
			if (err)
				throw Error(err);
			if (!objAsset.fixed_denominations)
				throw Error("divisible asset type");
			splitOutputOnAddresses(objAsset, arrAddresses);
		});
	});
}

eventBus.on('headless_wallet_ready', splitOutputs);
