import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";
import { addKnownLeg, getMirrorNodeLogs, saucerswapBreakdownMethodology, splitRevenue } from "../../helpers/saucerswap";

const methodology = {
  Volume: "Swap volume on SaucerSwap V1 pools, read from on-chain Swap events. Each swap is valued by its HBAR, USDC or other major-token side; swaps between two long-tail tokens are not counted.",
  Fees: "A 0.3% fee is charged to users on every swap, 1/6 goes to protocol.",
  UserFees: "A 0.3% fee is charged to users on every swap, 1/6 goes to protocol.",
  SupplySideRevenue: "There are 5/6 of swap fees goes to liquidity providers.",
  Revenue: "There are 1/6 goes to protocol.",
  ProtocolRevenue: "From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to the Development Fund and the POL and Incentive Reserve (54.5%, 40% from 2026-07-01, 50% from 2026-09-07). Before 2025-08-31, all protocol revenue.",
  HoldersRevenue: "From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to xSAUCE stakers and burned (45.5%, 60% from 2026-07-01, 50% from 2026-09-07).",
};

const breakdownMethodology = saucerswapBreakdownMethodology('A 0.3% fee charged on every swap.')

// https://docs.saucerswap.finance/protocol/saucerswap-v1
// v1 charges fee 0.3% per swap, 5/6 goes to LP, 1/6 goes to protocol
const SWAP_FEE = 0.003
const PROTOCOL_SHARE = 1 / 6

// Uniswap V2 Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)
const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'

// V1 pairs (factory 0.0.1062784) from SaucerSwap's pool list, keyed by pair contract id. A Uniswap V2 pair sorts its tokens by
// address, which for long-zero HTS addresses is the entity number, so token0 is the token with the lower entity number.
async function getPairs(): Promise<Record<string, { token0: string, token1: string }>> {
  return getConfig('saucerswap-v1-pairs', undefined, {
    fetcher: async () => {
      const pools: Array<any> = await httpGet('https://api.saucerswap.finance/pools', {
        headers: {
          'origin': 'https://www.saucerswap.finance',
          'x-api-key': getEnv('SAUCERSWAP_API_KEY'),
        }
      })
      const pairs: Record<string, { token0: string, token1: string }> = {}
      for (const { contractId, tokenA, tokenB } of pools) {
        const [token0, token1] = BigInt(tokenA.id.split('.')[2]) < BigInt(tokenB.id.split('.')[2]) ? [tokenA.id, tokenB.id] : [tokenB.id, tokenA.id]
        pairs[contractId] = { token0, token1 }
      }
      return pairs
    }
  })
}

const fetch = async (options: FetchOptions) => {
  const [pairs, logs] = await Promise.all([getPairs(), getMirrorNodeLogs(SWAP_TOPIC, options.startTimestamp, options.endTimestamp)])

  // Count only the HBAR or core-asset side of each swap. SaucerSwap's own volume API prices long-tail tokens from thin pools
  // and has reported millions of dollars for pools holding a few HBAR (e.g. HBAR/CARAT on 2026-11-09).
  const dailyVolume = options.createBalances()
  for (const log of logs) {
    const pair = pairs[log.contract_id]
    if (!pair) continue // Swap emitted by another Uniswap V2 fork on Hedera

    const words = log.data.slice(2).match(/.{64}/g)
    if (!words || words.length !== 4) throw new Error(`Unexpected Swap data in ${log.transaction_hash}`)
    const [amount0In, amount1In, amount0Out, amount1Out] = words.map((word: string) => BigInt('0x' + word))
    // neither side HBAR or a core asset: skipped
    addKnownLeg(dailyVolume, pair.token0, pair.token1, amount0In + amount0Out, amount1In + amount1Out)
  }

  const dailyFees = dailyVolume.clone(SWAP_FEE, 'Token Swap Fees')
  const dailyRevenue = dailyVolume.clone(SWAP_FEE * PROTOCOL_SHARE, 'Swap Fees To Protocol')
  const dailySupplySideRevenue = dailyVolume.clone(SWAP_FEE * (1 - PROTOCOL_SHARE), 'Swap Fees To LPs')
  const { dailyProtocolRevenue, dailyHoldersRevenue } = splitRevenue(options, await dailyRevenue.getUSDValue());

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HEDERA],
  start: "2022-08-01", // first V1 swap on-chain: pool 0 SAUCE/HBAR at 2022-08-01 00:03 UTC
  methodology,
  breakdownMethodology,
};

export default adapter;
