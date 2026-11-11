import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "./chains";
import { isCoreAsset } from "./prices";

export const MIRROR_NODE = 'https://mainnet-public.mirrornode.hedera.com'

// SaucerSwap's wrapped HBAR, 8 decimals and 1:1 with HBAR: WHBAR [old] 0.0.1062664 (pools from 2022-23) and WHBAR [new] 0.0.1456986.
// DefiLlama has no price for the old one, and none for the new one before mid-2023, so both legs are valued as HBAR.
const WHBAR = new Set(['0.0.1062664', '0.0.1456986'])

// An HTS entity 0.0.N has the long-zero EVM address hex(N), the form DefiLlama prices Hedera tokens by
const toEvmAddress = (id: string) => '0x' + BigInt(id.split('.')[2]).toString(16).padStart(40, '0')

// Every log with this topic0 on Hedera in [fromTimestamp, toTimestamp), from the mirror node, oldest first.
// The mirror node only filters by topic within a timestamp range of at most 7 days.
export async function getMirrorNodeLogs(topic0: string, fromTimestamp: number, toTimestamp: number): Promise<Array<any>> {
  const logs: Array<any> = []
  let path = `/api/v1/contracts/results/logs?topic0=${topic0}&timestamp=gte:${fromTimestamp}&timestamp=lt:${toTimestamp}&limit=100&order=asc`
  while (path) {
    const res = await httpGet(MIRROR_NODE + path)
    logs.push(...res.logs)
    path = res.links?.next
  }
  return logs
}

/**
 * Add the HBAR or core-asset side of one swap to `balances`, so long-tail tokens are never priced.
 *
 * @param token0 HTS id (0.0.N) of the pool's token0, the token with the lower entity number
 * @param token1 HTS id of the pool's token1
 * @param amount0 token0 amount of the swap in raw units, unsigned
 * @param amount1 token1 amount of the swap in raw units, unsigned
 * @returns false when neither side is HBAR or a core asset and nothing was added
 */
export function addKnownLeg(balances: Balances, token0: string, token1: string, amount0: bigint, amount1: bigint): boolean {
  if (WHBAR.has(token0)) balances.addCGToken('hedera-hashgraph', Number(amount0) / 1e8)
  else if (WHBAR.has(token1)) balances.addCGToken('hedera-hashgraph', Number(amount1) / 1e8)
  else if (isCoreAsset(CHAIN.HEDERA, toEvmAddress(token0))) balances.add(toEvmAddress(token0), amount0.toString())
  else if (isCoreAsset(CHAIN.HEDERA, toEvmAddress(token1))) balances.add(toEvmAddress(token1), amount1.toString())
  else return false
  return true
}

// Protocol revenue (the fee-switch share of swap fees) buys SAUCE through BrewsaucerV2 (0.0.9575119), which splits what it
// bought between xSAUCE stakers (Mothership 0.0.1460199), the Development Fund (0.0.9453414), the POL and Incentive Reserve
// (0.0.9578664) and, from July 2026, a burn to 0xdead (0.0.9209843).
// https://docs.saucerswap.finance/tokenomics/overview#unified-brewsaucer-buybacks-and-burn
// Shares per era, read from every BrewsaucerV2 split transaction on the Hedera mirror node (372 splits to 2026-09-08):
// - first split 2025-08-31 14:13 UTC: 45.5% xSAUCE / 30% Development Fund / 24.5% POL and Incentive Reserve, no burn
// - last 3-way split 2026-06-30 23:00 UTC, first 4-way split 2026-07-01 23:01 UTC: 50% xSAUCE / 10% burn / 10% Development Fund / 30% POL
// - first split on the Unified BrewSaucer routing 2026-09-08 12:38:34 UTC (consensus 1788871114): 40% / 10% / 30% / 20%.
//   No split ran on 2026-09-07, so that day's fees went out on the new shares.
// Each daily split pays out the fees since the previous one, so each era starts at 00:00 UTC of the day its first split ran
// (the day before, for 2026-09-08). Before 2025-08-31 the split is not modelled and all revenue stays protocol revenue.
export const SPLITS = [
  { start: 1788739200, xsauce: 0.4, burn: 0.1, devFund: 0.3, pol: 0.2 },    // 2026-09-07
  { start: 1782864000, xsauce: 0.5, burn: 0.1, devFund: 0.1, pol: 0.3 },    // 2026-07-01
  { start: 1756598400, xsauce: 0.455, burn: 0, devFund: 0.3, pol: 0.245 },  // 2025-08-31
]

/**
 * Split one day's protocol revenue between holders revenue and protocol revenue, using the BrewsaucerV2 shares
 * of the era that contains the day.
 *
 * The era is picked by `options.startOfDay` (00:00 UTC of the day being fetched). Before 2025-08-31 everything
 * stays protocol revenue under 'Swap Fees To Protocol'. SPLITS must stay sorted newest era first.
 *
 * @param options fetch options of the adapter, used for `startOfDay` and `createBalances`
 * @param revenue the day's protocol revenue in USD: the 1/6 fee-switch share of swap fees
 * @returns `dailyProtocolRevenue` (Development Fund and POL shares; all revenue before 2025-08-31) and
 *   `dailyHoldersRevenue` (xSAUCE and burn shares; empty before 2025-08-31)
 */
export function splitRevenue(options: FetchOptions, revenue: number) {
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const split = SPLITS.find((s) => options.startOfDay >= s.start)
  if (!split) {
    dailyProtocolRevenue.addUSDValue(revenue, 'Swap Fees To Protocol')
  } else {
    dailyHoldersRevenue.addUSDValue(revenue * split.xsauce, 'Token Buy Back To xSAUCE Stakers')
    if (split.burn) dailyHoldersRevenue.addUSDValue(revenue * split.burn, 'Token Buy Back And Burn')
    dailyProtocolRevenue.addUSDValue(revenue * split.devFund, 'Token Buy Back To Development Fund')
    dailyProtocolRevenue.addUSDValue(revenue * split.pol, 'Token Buy Back To POL And Incentive Reserve')
  }
  return { dailyProtocolRevenue, dailyHoldersRevenue }
}

/**
 * breakdownMethodology shared by the SaucerSwap V1 and V2 adapters, covering every label they and `splitRevenue` emit.
 *
 * @param feesText description of the adapter's own swap fee, used for the 'Token Swap Fees' label in Fees and UserFees
 * @returns the breakdownMethodology object for the adapter
 */
export function saucerswapBreakdownMethodology(feesText: string) {
  return {
    Fees: {
      'Token Swap Fees': feesText,
    },
    UserFees: {
      'Token Swap Fees': feesText,
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': '5/6 of swap fees, paid to liquidity providers.',
    },
    Revenue: {
      'Swap Fees To Protocol': '1/6 of swap fees, the protocol fee switch.',
    },
    ProtocolRevenue: {
      'Swap Fees To Protocol': 'All protocol revenue before 2025-08-31, when BrewsaucerV2 splits start.',
      'Token Buy Back To Development Fund': 'SAUCE bought with protocol revenue and sent to the Development Fund: 30% of each buy, 10% from 2026-07-01, 30% from 2026-09-07.',
      'Token Buy Back To POL And Incentive Reserve': 'SAUCE bought with protocol revenue and sent to the POL and Incentive Reserve: 24.5% of each buy, 30% from 2026-07-01, 20% from 2026-09-07.',
    },
    HoldersRevenue: {
      'Token Buy Back To xSAUCE Stakers': 'SAUCE bought with protocol revenue and sent to the Mothership, which raises the xSAUCE to SAUCE ratio: 45.5% of each buy, 50% from 2026-07-01, 40% from 2026-09-07.',
      'Token Buy Back And Burn': 'SAUCE bought with protocol revenue and sent to 0xdead: 10% of each buy from 2026-07-01.',
    },
  }
}
