CREATE TABLE faucet_payouts (
	payout_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	device_address CHAR(33) NOT NULL,
	amount BIGINT NOT NULL,
	asset CHAR(44) NULL REFERENCES assets(unit),
	address CHAR(32) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX faucetByDeviceAddressDate ON faucet_payouts(device_address, creation_date);
