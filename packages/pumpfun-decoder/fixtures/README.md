# Pump.fun Decoder Fixtures

These JSON files are local, synthetic decoder fixtures. They are not secrets,
not wallet data, not live trading inputs, and not definitive Pump.fun
documentation.

They model the minimum Solana `getTransaction`-style shape the local decoder
needs today: signatures, slots, block time, account keys, instructions, logs,
balances, and token balances. The goal is to harden parser behavior before a
managed Yellowstone/LaserStream source or verified public transaction fixtures
are connected.

The fixtures intentionally avoid network calls, RPC calls, PumpPortal calls,
wallet loading, signing, or trading.
