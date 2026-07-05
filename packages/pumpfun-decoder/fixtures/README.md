# Pump.fun Decoder Fixtures

These JSON files are local decoder fixtures. The current checked-in fixtures
are synthetic and are registered in `manifest.json` with explicit provenance.
They are not secrets, not wallet data, not live trading inputs, and not
definitive Pump.fun documentation.

They model the minimum Solana `getTransaction`-style shape the local decoder
needs today: signatures, slots, block time, account keys, instructions, logs,
balances, and token balances. The goal is to harden parser behavior before a
managed Yellowstone/LaserStream source or verified public transaction fixtures
are connected.

Verified public fixtures can be imported from Solana `getTransaction` output
with the indexer CLI when `SOLANA_RPC_HTTP` is configured locally. Public
fixtures may contain public on-chain wallet, account, and program addresses;
that is expected public chain data, not private wallet material.

The fixtures and tests intentionally avoid live network calls, PumpPortal
calls, wallet loading, signing, or trading.
