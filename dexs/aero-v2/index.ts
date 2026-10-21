import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from '../../helpers/lists';
import { addOneToken } from '../../helpers/prices';
import { formatAddress } from '../../utils/utils';

// Aero v2: the stable / volatile AMM pools of Aero (the merged Aerodrome + Velodrome protocol,
// MetaDEX03), deployed with the same factory addresses on every chain. Each pool charges its fee
// on the input side and moves it to its PoolFees contract in the same swap, emitting Fees(sender,
// amount0, amount1) with the exact amounts, so fees are read from that event instead of applying a
// rate: the rate is dynamic (fee module, MEV tax, discount registry) and a snapshot would misprice it.
const FACTORIES = {
  volatile: '0x9bc8b3F60D349d687Fb44A018967025E3741F9a5',
  stable: '0xaEd253F1aD84d99f2165256D701b2b481DD4CC16',
}

// factory deployment blocks (sourcify, 2026-10-16 on the launch chains, 2026-09-15 on arc);
// robinhood and the arc volatile factory have no verified deployment record, so a block shortly
// before the sibling / CL factory deployment is used
const CONFIG: Record<string, { fromBlock: number; start: string }> = {
  [CHAIN.BASE]: { fromBlock: 52688371, start: '2026-10-16' },
  [CHAIN.OPTIMISM]: { fromBlock: 158285225, start: '2026-10-16' },
  [CHAIN.ARBITRUM]: { fromBlock: 515435575, start: '2026-10-16' },
  [CHAIN.ETHEREUM]: { fromBlock: 26206292, start: '2026-10-16' },
  [CHAIN.INK]: { fromBlock: 58673583, start: '2026-10-16' },
  [CHAIN.ARC]: { fromBlock: 20964900, start: '2026-09-15' },
  [CHAIN.ROBINHOOD]: { fromBlock: 90200000, start: '2026-10-16' },
}

const POOL_CREATED = 'event PoolCreated(address indexed token0, address indexed token1, address pool, uint256)'
const SWAP = 'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
const FEES = 'event Fees(address indexed sender, uint256 amount0, uint256 amount1)'

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { createBalances, getLogs, getToBlock, chain } = options
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const { fromBlock } = CONFIG[chain]
  const toBlock = await getToBlock()

  const blacklist = new Set(getDefaultDexTokensBlacklisted(chain))
  const pools: Record<string, { token0: string; token1: string }> = {}
  for (const factory of Object.values(FACTORIES)) {
    const created = await getLogs({ target: factory, fromBlock, toBlock, eventAbi: POOL_CREATED, cacheInCloud: true })
    for (const { token0, token1, pool } of created) {
      if (blacklist.has(formatAddress(token0)) || blacklist.has(formatAddress(token1))) continue
      pools[pool.toLowerCase()] = { token0, token1 }
    }
  }
  const targets = Object.keys(pools)
  if (!targets.length) return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees.clone() }

  const swaps = await getLogs({ targets, eventAbi: SWAP, onlyArgs: false })
  for (const log of swaps) {
    const { token0, token1 } = pools[log.address.toLowerCase()]
    const amount0 = Number(log.args.amount0In) + Number(log.args.amount0Out)
    const amount1 = Number(log.args.amount1In) + Number(log.args.amount1Out)
    addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
  }

  const fees = await getLogs({ targets, eventAbi: FEES, onlyArgs: false })
  for (const log of fees) {
    const { token0, token1 } = pools[log.address.toLowerCase()]
    dailyFees.add(token0, log.args.amount0, 'Token Swap Fees')
    dailyFees.add(token1, log.args.amount1, 'Token Swap Fees')
  }

  // no gauges are registered for these pools yet (the LeafVoter / gauge manager is not routing
  // fees), so every fee is claimable by the LPs
  return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees.clone() }
}

const methodology = {
  Volume: 'Swap volume on Aero v2 stable and volatile pools, counting one side of each swap.',
  Fees: 'Swap fees paid by traders, taken from the Fees event each pool emits when it moves the input-side fee to its PoolFees contract (covers the dynamic fee module, MEV tax and discounts).',
  Revenue: 'Zero: no gauges are registered for these pools yet, so no fees are redirected to veAERO voters.',
  SupplySideRevenue: 'All swap fees, claimable by liquidity providers.',
}

const breakdownMethodology = {
  Fees: { 'Token Swap Fees': 'Swap fees paid by traders on Aero v2 pools.' },
  SupplySideRevenue: { 'Token Swap Fees': 'Swap fees claimable by liquidity providers.' },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: Object.fromEntries(Object.entries(CONFIG).map(([chain, { start }]) => [chain, { fetch, start }])),
}

export default adapter
