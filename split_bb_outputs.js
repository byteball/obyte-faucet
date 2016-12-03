/*jslint node: true */
"use strict";
var _ = require('byteballcore/node_modules/lodash');
var headlessWallet = require('headless-byteball');
var constants = require('byteballcore/constants.js');
var eventBus = require('byteballcore/event_bus.js');
var objectHash = require('byteballcore/object_hash.js');
var db = require('byteballcore/db.js');
var storage = require('byteballcore/storage.js');

const asset = constants.BLACKBYTES_ASSET;
const objAsset = {is_private: true, fixed_denominations: true};

function readAddresses(handleAddresses){
	db.query(
		"SELECT address FROM my_addresses JOIN outputs USING(address) WHERE asset=? AND is_spent=0",
		[asset],
		function(rows){
			handleAddresses(rows.map(function(row){ return row.address; }));
		}
	);
}

var indivisibleAsset = require('byteballcore/indivisible_asset.js');
indivisibleAsset.updateIndivisibleOutputsThatWereReceivedUnstable(db, function(){});

function onError(err){
	throw Error(err);
}

function splitOutputOnAddresses(arrAddresses){
	var composer = require('byteballcore/composer.js');
	var network = require('byteballcore/network.js');

	
	function pickCoins(conn, last_ball_mci, bMultiAuthored, onDone){
		var arrPayloadsWithProofs = [];
		conn.query(
			"SELECT unit, message_index, output_index, amount, denomination, address, blinding \n\
			FROM outputs JOIN units USING(unit) \n\
			WHERE asset=? AND address IN(?) AND is_serial=1 AND is_spent=0 AND sequence='good' \n\
				AND main_chain_index<=? AND is_stable=1 \n\
			ORDER BY amount/denomination DESC, unit, denomination \n\
			LIMIT 16",
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
					var arrOutputs = [];
					for (var i=0; i<10; i++)
						arrOutputs.push({
							address: row.address,
							amount: row.amount/10,
							blinding: composer.generateBlinding()
						});
					var payload = {
						asset: asset,
						denomination: row.denomination,
						inputs: [input],
						outputs: arrOutputs
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
				console.error('arrPayloadsWithProofs', require('util').inspect(arrPayloadsWithProofs, {depth:null}));
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


eventBus.on('headless_wallet_ready', function(){
	readAddresses(splitOutputOnAddresses);
});

