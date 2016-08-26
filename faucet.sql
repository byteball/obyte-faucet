CREATE TABLE faucet_payouts (
	payout_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	device_address CHAR(33) NOT NULL,
	amount BIGINT NOT NULL,
	address CHAR(32) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX faucetByDeviceAddressDate ON faucet_payouts(device_address, creation_date);
