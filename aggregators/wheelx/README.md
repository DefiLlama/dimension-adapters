# WheelX DefiLlama Adapter

[WheelX](https://wheelx.fi) is a cross-chain bridge aggregator and DEX that enables users to swap and bridge tokens across 25+ blockchain networks.

## Adapter Structure

```
wheelx/
├── index.ts      # Bridge aggregator volume adapter (bridge-aggregators)
├── fees.ts       # Fees & revenue adapter (fees dashboard)
└── README.md     
```

## Data Source

Both adapters use the **enhanced WheelX API** (`/v1/orders` and `/v1/orders/stats` endpoints) to fetch:

- **Volume**: Cross-chain bridge volume denominated in source tokens, auto-priced by DefiLlama's oracle
- **Fees**: Bridge fees + swap fees collected by the WheelX protocol
- **Revenue**: Protocol's portion of fees (~30% after discounts and supply-side costs)
- **Supply Side Revenue**: Portion distributed to integrators, bridge operators, and LPs (~70%)

## API Endpoints Used

### `GET /v1/orders`
Enhanced transaction explorer with filters:
- `address` - Filter by sender address
- `from_chain` / `to_chain` - Chain ID filters
- `from_token` / `to_token` - Token address filters
- `status` - Order status (open/filled/failed)
- `start_date` / `end_date` - ISO datetime range
- `limit` / `offset` - Pagination
- `sort_by` / `sort_order` - Sorting

### `GET /v1/orders/stats`
Aggregated statistics for the DefiLlama adapter:
- Total volume, order count, fees, points
- Volume breakdown by source chain and chain pair
- Order counts by status and bridge type

### `GET /v1/orders/export`
CSV export for external analytics tooling.

## Testing

```bash
# Test the bridge aggregator volume adapter
pnpm test bridge-aggregators wheelx

# Test the fees adapter
pnpm test fees wheelx
```

## Chain Mapping

WheelX uses internal chain IDs that are mapped to DefiLlama chain constants in the adapter. The mapping covers all major EVM chains plus Solana.

## Methodology

### Bridge Aggregator Volume
Tracks the sum of all cross-chain bridge transaction values initiated through WheelX, measured on the source chain.

### Fees
- **Gross Protocol Revenue (dailyFees)**: All bridge + swap fees collected by WheelX
- **Cost of Revenue (dailySupplySideRevenue)**: Portion paid to integrators, bridge operators, and liquidity providers
- **Gross Profit (dailyRevenue)**: Portion retained by WheelX protocol
