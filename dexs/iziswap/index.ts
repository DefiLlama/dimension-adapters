import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { METRIC } from "../../helpers/metrics";
import { addOneToken } from "../../helpers/prices";

const chainConfig: Record<string, { factories: string[], start: string, latestStateOnly?: boolean }> = {
  [CHAIN.BSC]: { factories: ['0xd7de110Bd452AAB96608ac3750c3730A17993DE0', '0x93BB94a0d5269cb437A1F71FF3a77AB753844422'], start: '2023-04-05' },
  [CHAIN.ERA]: { factories: ['0x33D9936b7B7BC155493446B5E6dDC0350EB83AEC', '0x575Bfc57B0D3eA0d31b132D622643e71735A6957'], start: '2023-04-05' },
  [CHAIN.ARBITRUM]: { factories: ['0xCFD8A067e1fa03474e79Be646c5f6b6A27847399'], start: '2023-07-17' },
  // [CHAIN.METER]: { factories: [], start: '2023-07-17' }, // no working public RPC (rpc.meter.io returns Cloudflare 1033), and the izumi API reported no Meter volume after 2024-03-24
  [CHAIN.AURORA]: { factories: ['0xce326A82913EAb09f7ec899C4508Cbe0E6526A74', '0x156d8a0bE25FA232bb637Fc76255bCd00dEae9E9'], start: '2022-10-11' },
  [CHAIN.POLYGON]: { factories: ['0xcA7e21764CD8f7c1Ec40e651E25Da68AeD096037'], start: '2023-07-17' },
  [CHAIN.MANTLE]: { factories: ['0x45e5F26451CDB01B0fA1f8582E0aAD9A6F27C218'], start: '2023-07-17' },
  // RPCs only serve eth_call at the latest block
  [CHAIN.ONTOLOGY_EVM]: { factories: ['0x032b241De86a8660f1Ae0691a4760B426EA246d7'], start: '2023-07-17', latestStateOnly: true },
  [CHAIN.ULTRON]: { factories: ['0xd7de110Bd452AAB96608ac3750c3730A17993DE0'], start: '2023-07-17' },
  [CHAIN.LINEA]: { factories: ['0x45e5F26451CDB01B0fA1f8582E0aAD9A6F27C218'], start: '2023-07-17' },
  [CHAIN.SCROLL]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2023-07-17' },
  [CHAIN.BASE]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2023-07-17' },
  [CHAIN.MANTA]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2023-07-17' },
  [CHAIN.ZETA]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2023-07-17' },
  [CHAIN.MODE]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2023-07-17' },
  // configured RPCs prune state older than 3000 blocks (onfinality, the archive one, is ~460k blocks behind)
  [CHAIN.IOTEX]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2023-07-17', latestStateOnly: true },
  [CHAIN.MONAD]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2025-11-24' },
  // [CHAIN.HEMI]: { factories: ['0x8c7d3063579BdB0b90997e18A770eaE32E1eBb08'], start: '2023-07-17' }, // hidden due to wash trades (#4250)
};

const swapEvents = [
  'event Swap(address indexed tokenX, address indexed tokenY, uint24 indexed fee, bool sellXEarnY, uint256 amountX, uint256 amountY, int24 currentPoint)',
  'event Swap(address indexed tokenX, address indexed tokenY, uint24 indexed fee, bool sellXEarnY, uint256 amountX, uint256 amountY)',
]

const fetch = async (options: FetchOptions) => {
  const { factories, latestStateOnly } = chainConfig[options.chain]
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // noTarget + factory check (not `targets`): factories hold up to ~650 pools per chain, and iZiSwap forks
  // on the same chains emit the same Swap event, so a pool only counts when an iZiSwap factory registered it
  const swaps: { pool: string, args: any }[] = []
  for (const eventAbi of swapEvents) {
    const logs = await options.getLogs({ noTarget: true, eventAbi, onlyArgs: false })
    logs.forEach((log: any) => swaps.push({ pool: String(log.address ?? log.source).toLowerCase(), args: log.args }))
  }
  if (!swaps.length) return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue.clone() }

  const pools: Record<string, { tokenX: string, tokenY: string, fee: number }> = {}
  swaps.forEach(({ pool, args }) => pools[pool] = { tokenX: args.tokenX, tokenY: args.tokenY, fee: Number(args.fee) })
  const poolList = Object.keys(pools)
  const iziPools = new Set<string>()
  // read at the latest block: a factory never unregisters a pool, so the answer is the same as at the window's block,
  // and it keeps chains whose RPCs cannot serve historic eth_call (ontology_evm, iotex) working
  const latestApi = new ChainApi({ chain: options.chain })
  for (const factory of factories) {
    const registered = await latestApi.multiCall({
      target: factory,
      abi: 'function pool(address tokenX, address tokenY, uint24 fee) view returns (address)',
      calls: poolList.map(pool => ({ params: [pools[pool].tokenX, pools[pool].tokenY, pools[pool].fee] })),
    })
    registered.forEach((address: string, i: number) => { if (address.toLowerCase() === poolList[i]) iziPools.add(poolList[i]) })
  }

  const chargedPools = [...iziPools]
  const chargePercents = await (latestStateOnly ? latestApi : options.api).multiCall({ abi: 'function feeChargePercent() view returns (uint24)', calls: chargedPools })
  const protocolShare: Record<string, number> = {}
  chargedPools.forEach((pool, i) => protocolShare[pool] = Number(chargePercents[i]) / 100)

  const blacklistedTokens = new Set(getDefaultDexTokensBlacklisted(options.chain))
  swaps.forEach(({ pool, args }) => {
    if (!iziPools.has(pool)) return
    if (blacklistedTokens.has(args.tokenX.toLowerCase()) || blacklistedTokens.has(args.tokenY.toLowerCase())) return
    const feeRate = Number(args.fee) / 1e6
    addOneToken({ chain: options.chain, balances: dailyVolume, token0: args.tokenX, amount0: args.amountX, token1: args.tokenY, amount1: args.amountY })
    const { token, amount } = addOneToken({ chain: options.chain, balances: dailyFees, token0: args.tokenX, amount0: Number(args.amountX) * feeRate, token1: args.tokenY, amount1: Number(args.amountY) * feeRate, label: METRIC.SWAP_FEES })
    dailyRevenue.add(token, amount * protocolShare[pool], 'Swap Fees To Protocol')
    dailySupplySideRevenue.add(token, amount * (1 - protocolShare[pool]), 'Swap Fees To LPs')
  })

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue.clone() }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: 'Value of all tokens swapped through iZiSwap pools, read from the pools\' Swap events.',
    Fees: 'Swap fees paid by traders, the pool fee tier applied to each swap.',
    Revenue: 'Share of swap fees each pool charges for the protocol, set per pool.',
    ProtocolRevenue: 'Share of swap fees each pool charges for the protocol, sent to the iZiSwap fee receiver.',
    SupplySideRevenue: 'Swap fees left to liquidity providers after the protocol share.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Swap fees paid by traders, charged on the input token at the pool\'s fee tier.',
    },
    Revenue: {
      'Swap Fees To Protocol': 'Share of swap fees set by each pool\'s feeChargePercent, collected by the iZiSwap fee receiver.',
    },
    ProtocolRevenue: {
      'Swap Fees To Protocol': 'Share of swap fees set by each pool\'s feeChargePercent, collected by the iZiSwap fee receiver.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Remaining share of swap fees accrued to the pool\'s liquidity providers.',
    },
  },
};

export default adapter;
