# Fees Adapter Guidelines

These guidelines apply to all adapters in the `fees/` directory.

> **For the most up-to-date information**: https://docs.llama.fi/list-your-project/other-dashboards

## Why Income Statement Model?

Our system follows **GAAP accounting standards** because:
- Users need to know exactly what we're counting (e.g., does Ethereum fees include blob fees?)
- Institutional clients expect standardized financial reporting
- Tokenholders make money in many ways beyond just burns/distributions (airdrops, bribes, etc.)

**When writing adapters you should:**
- Break down each component as much as possible
- Name and description of each component must be easy to understand
- When a user wonders "does this include X revenue stream/cost?" the answer should be obvious from the breakdown
- Include every way tokenholders make money, even if coming from another protocol

## Guiding Principle

**'Gross Protocol Revenue' (dailyFees) should include everything the protocol COULD charge.**

Example: For Aave, if depositors get 70% and protocol gets 30% of borrow fees, `dailyFees` includes 100% because protocol could theoretically take it all.

For Lido, `dailyFees` = all ETH staking rewards from staked ETH, since they could theoretically keep it all.

Think: "If the protocol became super-greedy and rugged all parties, how much could they make?"

**Why investors care about breakdowns:**
- How durable is the revenue? (liquidation spike vs recurring borrow interest)
- How diversified is the revenue?
- Can profit grow by reducing costs? How much leeway does protocol have?

## Required Dimensions

| Dimension | Required | Maps To | Description |
|-----------|----------|---------|-------------|
| `dailyFees` | **YES** | Gross Protocol Revenue | All fees from ALL sources - total value flow into protocol ecosystem |
| `dailyRevenue` | **YES** | Gross Profit | `dailyFees - dailySupplySideRevenue` - what protocol keeps |
| `dailySupplySideRevenue` | When applicable | Cost of Funds | Portion to LPs, lenders, stakers, integrators, referrers, creators |
| `dailyUserFees` | Optional | - | Portion directly paid by end-users |
| `dailyProtocolRevenue` | Optional | - | Portion allocated to treasury |
| `dailyHoldersRevenue` | When applicable | Tokenholder Income | All value to token holders (buybacks, burns, distributions, external airdrops, bribes) |

## Income Statement Template

### Gross Protocol Revenue (dailyFees)
- \+ Swap Fees
- \+ Liquidation Fees
- \+ Interest Income (borrow interest)
- \+ Staking Rewards
- \+ MEV Captured
- \+ Gas Fees (for chain adapters)

### Cost of Funds (dailySupplySideRevenue)
- \- LP Payments
- \- Interest Expenses (paid to lenders/depositors)
- \- Staking Rewards passed through (less fees)
- \- MEV paid to stakers (less fees)
- \- Blob fees to mainnet (for rollups)
- \- Validator Commissions
- \- Trading Rebates (including token emission funded)
- \- Integrator / Referral Fees
- \- Creator Royalties / Fees

### Gross Profit (dailyRevenue)
= Gross Protocol Revenue - Cost of Funds

### Tokenholder Income (dailyHoldersRevenue) - OFF STATEMENT

**Capital Allocations:**
- \+ Treasury Buybacks
- \+ Tokenholder Distributions

**Other Tokenholder Flows:**
- \+ Airdrops from Other Protocols (e.g., Binance Earn)
- \+ Bribes from Other Protocols
- \+ Other Off-Protocol Income

## Breakdown Labels - CRITICAL

**Every label used in `.add()` calls MUST appear in `breakdownMethodology`**, and every label in `breakdownMethodology` must have corresponding data in code.

### Why Labels Matter

**ALWAYS provide labels even when there is only one source of fees.** This prevents needing to update and backfill data later when adapter is listed under a parent protocol.

Example: When writing Fluid DEX adapter, add `'Swap Fees'` label even if it's the only fee source. Later when Fluid Lending is added under Fluid parent protocol, the DEX adapter already has proper labels.

### Label Naming Rules

**Good labels - clear, descriptive, immediately understandable:**
- `'Borrow Interest'` - clear what borrowers pay
- `'GHO Borrow Interest'` - specific to GHO market
- `'Liquidation Fees'` - describes fee source
- `'Staking Rewards'` - clear revenue source
- `'Borrow Interest To Treasury'` - clear destination
- `'Borrow Interest To Lenders'` - clear who receives

**Bad labels - vague, not informative (avoid for new adapters):**
- `'Protocol Fees'` - too vague, prefer specific source labels
- `'Fees'` - not descriptive
- `'Revenue'` - doesn't explain source
- `'Other'` / `'Misc'` - meaningless

> Note: Some existing adapters may use generic labels like 'Protocol Fees'. New adapters should use more specific labels. Updates to existing adapters are encouraged but not required.

### How Labels Change Per Dimension

| Dimension | Label Style | Examples |
|-----------|-------------|----------|
| `dailyFees` | Source of fees (simple) | `'Swap Fees'`, `'Borrow Interest'`, `'Liquidation Fees'` |
| `dailySupplySideRevenue` | Source + Destination | `'Borrow Interest To Lenders'`, `'Swap Fees To LPs'` |
| `dailyRevenue` | Source + Destination | `'Borrow Interest To Treasury'`, `'Swap Fees To Protocol'` |
| `dailyHoldersRevenue` | Distribution type | `'Token Buy Back'`, `'Staking Distributions'` |

### Code Examples

```typescript
// dailyFees - simple source labels
dailyFees.add(token, totalBorrowInterest, 'Borrow Interest')
dailyFees.add(token, liquidationFees, 'Liquidation Fees')
dailyFees.add(token, flashloanFees, 'Flashloan Fees')

// dailySupplySideRevenue - detailed destination labels  
dailySupplySideRevenue.add(token, lenderShare, 'Borrow Interest To Lenders')
dailySupplySideRevenue.add(token, lpFees, 'Swap Fees To LPs')

// dailyRevenue - detailed destination labels
dailyRevenue.add(token, protocolShare, 'Borrow Interest To Treasury')

// dailyHoldersRevenue - distribution labels
dailyHoldersRevenue.add(token, buybackAmount, 'Token Buy Back')
dailyHoldersRevenue.add(token, bribes, 'Bribes from Protocol X')
```

### breakdownMethodology Object - REQUIRED

```typescript
const breakdownMethodology = {
  Fees: {
    'Borrow Interest': 'All interest paid by borrowers from all markets.',
    'Liquidation Fees': 'Fees from liquidation penalties.',
    'Flashloan Fees': 'Fees paid by flashloan users.',
  },
  Revenue: {
    'Borrow Interest To Treasury': 'Protocol share of borrow interest.',
  },
  SupplySideRevenue: {
    'Borrow Interest To Lenders': 'Interest distributed to lenders.',
  },
  HoldersRevenue: {
    'Token Buy Back': 'Token buybacks from treasury.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-01-01',
  methodology,
  breakdownMethodology, // REQUIRED when using labels
}
```

## Real-World Examples

### Lending Protocol (Aave style)
```typescript
const breakdownMethodology = {
  Fees: {
    'Borrow Interest': 'All interest paid by borrowers (excluding GHO).',
    'Borrow Interest GHO': 'Interest paid by GHO borrowers.',
    'Liquidation Fees': 'Liquidation penalty and bonuses.',
    'Flashloan Fees': 'Fees from flashloan users.',
  },
  SupplySideRevenue: {
    'Borrow Interest To Lenders': 'Interest distributed to lenders.',
    'Liquidation Fees To Lenders': 'Liquidation fees to lenders.',
  },
  Revenue: {
    'Borrow Interest To Treasury': 'Protocol share collected by treasury.',
    'Borrow Interest GHO': '100% of GHO interest to treasury.',
  },
}
```

### DEX with Buybacks (Hyperliquid style)
```typescript
const breakdownMethodology = {
  Fees: {
    'Spot Fees': 'Fees on all spot trades (excluding Unit markets).',
    'Spot fees on Unit markets': 'Fees from Unit asset markets.',
  },
  SupplySideRevenue: {
    'Unit Revenue': 'All Unit market fees go to Unit.',
    'HLP': '1% of spot fees to HLP vault.',
  },
  Revenue: {
    'Spot Fees': '99% of spot fees (excluding Unit).',
  },
  HoldersRevenue: {
    'Token Buy Back': '99% of spot fees for HYPE buybacks.',
  },
}
```

### Liquid Staking (Lido style)
```typescript
const breakdownMethodology = {
  Fees: {
    'Staking Rewards': 'ETH validator rewards.',
    'MEV Rewards': 'MEV rewards from execution layer.',
  },
  SupplySideRevenue: {
    'Staking Rewards To Stakers': '90% of staking rewards to stETH holders.',
    'MEV Rewards To Stakers': '90% of MEV to stETH holders.',
  },
  Revenue: {
    'Staking Rewards Fee': '10% protocol fee on staking rewards.',
    'MEV Rewards Fee': '10% protocol fee on MEV.',
  },
}
```

## Protocol Type Reference

| Type | dailyFees | dailyRevenue | dailySupplySideRevenue | dailyHoldersRevenue |
|------|-----------|--------------|------------------------|---------------------|
| DEX | Swap fees | Protocol's % | LP revenue | Token distributions |
| Lending | Borrow interest | Protocol's % | Interest to lenders | Distributions |
| Liquid Staking | All staking rewards | Protocol fee % | Rewards to stakers | Distributions |
| Chain | Gas fees | Burned fees | Sequencer/blob costs | N/A |
| Perp DEX | Trading fees | Protocol's % | LP revenue + rebates | Staker distributions |
| CDP | Borrow fees | Protocol's % | N/A | Distributions |
| NFT Marketplace | Trading fees | Marketplace revenue | Creator earnings | N/A |

## Common Mistakes to Avoid

1. **Counting block rewards as fees** - they are incentives, not fees
2. **Not providing breakdown labels** - always add labels, even for single source
3. **Using vague labels** - "Protocol Fees", "Other", "Misc" are not acceptable
4. **Missing dailySupplySideRevenue** - required when protocol pays suppliers
5. **Forgetting integrator/referrer fees** - these are supply side costs
6. **Missing external tokenholder income** - include airdrops, bribes from other protocols
7. **Missing breakdownMethodology** - required when using labels in .add() calls
8. **Mismatch between labels and breakdownMethodology** - every label must be documented

## Volume Tracking

If this adapter also tracks volume (dexs/ style metrics), see `dexs/GUIDELINES.md` for volume-specific rules. Both fees and volume can coexist in a fees adapter.
