# dyorSwap Launchpad Adapter

## Overview
This adapter tracks volume and fees for tokens created through the **dyorSwap Launchpad** on Plasma chain.

## Architectural Pattern (NON-STANDARD)
The dyorSwap launchpad uses a **bonding curve pattern** that differs from standard Uniswap V2:

- **Tokens ARE the trading contracts**: Each TOKEN contract has an integrated bonding curve
- **Swap events from TOKENs directly**: Not from separate pool contracts
- **PairCreated.pair is misleading**: The Factory's `PairCreated.pair` address is an intermediate contract, NOT used for trading
- **Actual trading address**: The `newToken` address from the `Deployed` event

## How It Works

1. **Discovery**: Scans `Deployed` events from the Launchpad contract to find all created tokens
2. **Volume Tracking**: Monitors `Swap` events emitted directly by TOKEN contracts
3. **Fee Calculation**: 1.0% of swap volume (validated from on-chain data)

## Event Flow
```
User → Launchpad.createToken()
  ├─ Emits: Deployed(newToken, creator, tokenSupply, wxplAmount)
  ├─ Emits: PairCreated(token0, token1, pair, ...) [from Launchpad]
  └─ Emits: PairCreated(token0, token1, pair, ...) [from Factory]
      └─ Note: Factory's pair ≠ trading address!

Trading → TOKEN.swap()
  └─ Emits: Swap(...) from TOKEN address (not pair!)
```

## Key Addresses
- **Launchpad**: `0x5a96508c1092960dA0981CaC7FD00217E9CdabEC`
- **Factory**: `0xA9F2c3E18E22F19E6c2ceF49A88c79bcE5b482Ac`
- **WXPL**: `0x6100E367285b01F48D07953803A2d8dCA5D19873`
- **Start Block**: 1,872,202

## Fee Structure
- **Rate**: 1.0% (not 0.3% like standard AMMs)
- **BUY fees**: Calculated from `tx.value - WXPL deposit`
- **SELL fees**: ~1% of withdrawal amount
- **Distribution**: 2/3 to Wallet A, 1/3 to Wallet B

## Performance Optimizations
- **Stateless design**: Rebuilds token list dynamically each fetch
- **In-memory caching**: Within same process execution
- **Chunked requests**: 10 blocks per query (Alchemy Free Tier limit)
- **Scan limitation**: Last 1000 blocks for local testing (production handles full history)

## Testing
```bash
npm run test dexs dyorswap-launchpad
```

## Known Limitations
1. **Local testing**: Only scans last 1000 blocks to avoid timeout
2. **Production**: DefiLlama infrastructure handles full historical data
3. **RPC constraints**: Alchemy Free Tier limits to 10 blocks per query

## Validation
Volume and fees have been validated against:
- On-chain transaction analysis
- DexScreener data
- PlasmaExplorer

## References
- Technical Report: `INFORME-TECNICO-LAUNCHPAD-COMPLETO.md`
- Validation Results: `LAUNCHPAD-24H-RESULTS.md`
