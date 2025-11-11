.PHONY: build test lint

build:
	sui move build

test:
	sui move test

lint:
	sui move build --lint

list_envs:
	sui client envs

# start the localnet with faucet and force regenesis
start:
	sui start --with-faucet --force-regenesis

# switch to localnet, or testnet, or mainnet
switch_env:
	sui client switch --env localnet

list_addresses:
	sui client addresses

switch_address:
	sui client switch --address capy

bal:
	sui client balance

# publish the contract
publish:
	sui client publish --gas-budget 100000000

	