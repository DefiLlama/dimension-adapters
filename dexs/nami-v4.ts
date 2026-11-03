import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addOneToken } from "../helpers/prices";
import { filterPools } from "../helpers/uniswap";

const LPS_LABEL = 'Swap Fees To LPs'
const ALGEBRA_LABEL = 'Swap Fees To Algebra'
const VOTERS_LABEL = 'Swap Fees To veNAMI Voters'
const STAKERS_LABEL = 'Swap Fees To ogNAMI Stakers'
const OTHER_LABEL = 'Swap Fees To Other Fee Receivers'

type Bucket = 'supplySide' | 'holders' | 'protocol'
type Receiver = { label: string; bucket: Bucket }

const ALGEBRA: Receiver = { label: ALGEBRA_LABEL, bucket: 'supplySide' }
const OGNAMI_STAKERS: Receiver = { label: STAKERS_LABEL, bucket: 'holders' }
const ALGEBRA_FEE_RECEIVER = '0x6cbd743d9b97da1855e64893d3226f8edca16e76'

const chainConfig: Record<string, { factory: string; fromBlock: number; feeReceivers: Record<string, Receiver>; start: string }> = {
  [CHAIN.ETHEREUM]: {
    factory: '0xD1Bf4A24DC17Da21410a7b047471E191eA538d43', fromBlock: 25965060, start: '2026-09-13',
    feeReceivers: {
      [ALGEBRA_FEE_RECEIVER]: ALGEBRA,
      '0xddf5bfeeeea89cc165466dd10f16a1dda15a1645': OGNAMI_STAKERS,
    },
  },
  [CHAIN.BASE]: {
    factory: '0xf4502A98A15e82D66d28D2381E2F3A407ea45b83', fromBlock: 51235349, start: '2026-09-13',
    feeReceivers: {
      [ALGEBRA_FEE_RECEIVER]: ALGEBRA,
      '0x651c97f99285cf1c6fb0265f51eb7baa325c21f4': OGNAMI_STAKERS,
    },
  },
  [CHAIN.ROBINHOOD]: {
    factory: '0xDeDB80903df19f9dB9b393eb66E07511CB9ABdA2', fromBlock: 61554171, start: '2026-09-13',
    feeReceivers: {
      [ALGEBRA_FEE_RECEIVER]: ALGEBRA,
      '0x027e7c960392d5d3e4e17a1d919d099ea6a91b49': OGNAMI_STAKERS,
    },
  },
}

const poolCreatedEvent = 'event Pool(address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)'
const swapFeeEvent = 'event SwapFee(address indexed sender, uint24 overrideFee, uint24 pluginFee)'
const globalStateAbi = 'function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)'
const getFeesDataAbi = 'function getFeesData(address pool) view returns (address[] receivers, uint64[] shares, uint64 feeBasis)'

const FEE_DENOMINATOR = 1e6
const MAX_COMMUNITY_FEE = 1e3
const ZERO_ADDRESS = ADDRESSES.null

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options
  const { factory, fromBlock, feeReceivers } = chainConfig[chain]
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const buckets: Record<Bucket, any> = { supplySide: dailySupplySideRevenue, holders: dailyHoldersRevenue, protocol: dailyProtocolRevenue }

  const poolLogs = await getLogs({ target: factory, eventAbi: poolCreatedEvent, fromBlock, cacheInCloud: true })
  const pairObject: Record<string, string[]> = {}
  poolLogs.forEach((log: any) => { pairObject[log.pool] = [log.token0, log.token1] })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const pools = Object.keys(filteredPairs)
  const result = () => {
    const dailyRevenue = dailyHoldersRevenue.clone()
    dailyRevenue.addBalances(dailyProtocolRevenue)
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
  }
  if (!pools.length) return result()

  // https://docs.nami.fi/use-nami/earn/liquidity-pools
  const states = await api.multiCall({ abi: globalStateAbi, calls: pools })
  const vaults = await api.multiCall({ abi: 'address:communityVault', calls: pools })
  const vaultPools = pools.filter((_, i) => vaults[i] !== ZERO_ADDRESS && Number(states[i].communityFee) > 0)
  const vaultFactories = await api.multiCall({ abi: 'address:factory', calls: vaultPools.map(pool => vaults[pools.indexOf(pool)]) })
  const feesData = await api.multiCall({ abi: getFeesDataAbi, calls: vaultPools.map((pool, i) => ({ target: vaultFactories[i], params: [pool] })) })

  const unknownReceivers = new Set<string>()
  const split: Record<string, { label: string; bucket: Bucket; share: number }[]> = {}
  pools.forEach(pool => { split[pool] = [] })
  vaultPools.forEach((pool, i) => {
    const communityShare = Number(states[pools.indexOf(pool)].communityFee) / MAX_COMMUNITY_FEE
    const { receivers, shares, feeBasis } = feesData[i]
    if (Number(feeBasis) === 0) throw new Error(`nami-v4: zero fee basis for pool ${pool} on ${chain}`)

    let receiversShare = 0
    receivers.forEach((receiver: string, j: number) => {
      const share = Number(shares[j]) / Number(feeBasis)
      receiversShare += share
      const known = feeReceivers[receiver.toLowerCase()]
      if (!known) unknownReceivers.add(receiver)
      split[pool].push({ ...(known ?? { label: OTHER_LABEL, bucket: 'protocol' }), share: communityShare * share })
    })
    if (receiversShare > 1) throw new Error(`nami-v4: fee receiver shares exceed the fee basis for pool ${pool} on ${chain}`)
    const remainder = communityShare * (1 - receiversShare)
    if (remainder > 0) split[pool].push(communityShare === 1 ? { label: VOTERS_LABEL, bucket: 'holders', share: remainder } : { label: OTHER_LABEL, bucket: 'protocol', share: remainder })
  })
  unknownReceivers.forEach(receiver => console.log(`nami-v4: fee receiver ${receiver} on ${chain} is not in its feeReceivers, counted under '${OTHER_LABEL}'`))

  const swapLogs = await getLogs({ targets: pools, eventAbi: swapEvent, flatten: false, onlyArgs: false })
  const swapFeeLogs = await getLogs({ targets: pools, eventAbi: swapFeeEvent, flatten: false, onlyArgs: false })

  pools.forEach((pool, i) => {
    const [token0, token1] = pairObject[pool]
    const feeByLog: Record<string, number> = {}
    swapFeeLogs[i].forEach((log: any) => {
      feeByLog[`${log.transactionHash}-${log.logIndex}`] = (Number(log.args.overrideFee) + Number(log.args.pluginFee)) / FEE_DENOMINATOR
    })

    swapLogs[i].forEach((log: any) => {
      const { amount0, amount1 } = log.args
      const feeRate = feeByLog[`${log.transactionHash}-${Number(log.logIndex) - 1}`]
      if (feeRate === undefined) throw new Error(`nami-v4: no SwapFee before swap ${log.transactionHash} log ${log.logIndex} in pool ${pool} on ${chain}`)

      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
      const { token, amount } = addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(amount0) * feeRate, amount1: Number(amount1) * feeRate, label: METRIC.SWAP_FEES })

      let vaultShare = 0
      split[pool].forEach(({ label, bucket, share }) => {
        vaultShare += share
        buckets[bucket].add(token, amount * share, label)
      })
      dailySupplySideRevenue.add(token, amount * (1 - vaultShare), LPS_LABEL)
    })
  })

  return result()
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "Swap volume across all Nami V4 concentrated liquidity pools.",
    Fees: "Swap fees paid by traders, at the dynamic fee the Nami plugin sets for each swap.",
    UserFees: "Swap fees paid by traders, at the dynamic fee the Nami plugin sets for each swap.",
    Revenue: "Swap fees of gauged pools, paid to Nami token holders: 90% to veNAMI voters and 10% to ogNAMI stakers.",
    ProtocolRevenue: "Swap fees paid to Nami fee receivers other than Algebra, veNAMI voters and ogNAMI stakers.",
    HoldersRevenue: "Swap fees of gauged pools paid to veNAMI voters (90%) and ogNAMI stakers (10%).",
    SupplySideRevenue: "Swap fees of permissionless pools: 99% to liquidity providers and 1% to Algebra as the DEX licence fee.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders, at the per-swap fee emitted in the pool's SwapFee event.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fees paid by traders, at the per-swap fee emitted in the pool's SwapFee event.",
    },
    Revenue: {
      [VOTERS_LABEL]: "90% of gauged pools' swap fees, paid through the gauge to veNAMI voters.",
      [STAKERS_LABEL]: "10% of gauged pools' swap fees, converted and deposited into the ogNAMI staking contract.",
      [OTHER_LABEL]: "Swap fees paid by a pool's fee vault to a receiver not identified as Algebra or ogNAMI stakers.",
    },
    ProtocolRevenue: {
      [OTHER_LABEL]: "Swap fees paid by a pool's fee vault to a receiver not identified as Algebra or ogNAMI stakers.",
    },
    HoldersRevenue: {
      [VOTERS_LABEL]: "90% of gauged pools' swap fees, paid through the gauge to veNAMI voters.",
      [STAKERS_LABEL]: "10% of gauged pools' swap fees, converted and deposited into the ogNAMI staking contract.",
    },
    SupplySideRevenue: {
      [LPS_LABEL]: "Swap fees of permissionless pools kept by liquidity providers (99%).",
      [ALGEBRA_LABEL]: "Algebra's licence fee, 1% of permissionless pools' swap fees.",
    },
  },
}

export default adapter
