import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, IJSON, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from '../helpers/prices';
import { ethers } from "ethers";
import { filterPools } from '../helpers/uniswap';

const CONFIG = {
  factory: '0x2dA25E7446A70D7be65fd4c053948BEcAA6374c8',
  treasury: '0xE25E95F75432A79D31256CC3026E24AAA5540882'
}
const eventAbis = {
  event_poolCreated: 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
  event_swap: 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
}
const abis = {
  fee: 'uint256:fee',
  feeSplit: 'uint256:feeSplit',
}

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getToBlock, getFromBlock, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const holdersRevenue = createBalances()
  const supplySideRevenue = createBalances()
  const protocolRevenue = createBalances() 
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${CONFIG.factory.toLowerCase()}-${chain}.json`
  const { pairs, token0s, token1s } = await sdk.cache.readCache(cacheKey, { readFromR2Cache: true })
  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const filteredPools = await filterPools({ api: api, pairs: pairObject, createBalances: createBalances})
  const poolAddresses = Object.keys(filteredPools)
  const fees = await api.multiCall({ abi: abis.fee,  calls: poolAddresses })
  const feeSplits = await api.multiCall({ abi: abis.feeSplit, calls: poolAddresses })
  const feeRecipients = await api.multiCall({ abi: 'address:feeRecipient', calls: poolAddresses })
  const aeroPoolSet = new Set()
  const poolInfoMap = {} as any
  poolAddresses.forEach((pair, index) => {
    const pool = pair.toLowerCase()
    const fee = fees[index] / 1e6
    // share of the swap fee taken from LPs, in basis points; the rest stays with them
    const protocolShare = Number(feeSplits[index]) / 10000
    const hasGauge = feeRecipients[index] !== CONFIG.treasury
    poolInfoMap[pool] = { tokens: pairObject[pair], fee, protocolShare, hasGauge }
    aeroPoolSet.add(pool)
  })

  const iface = new ethers.Interface([eventAbis.event_swap]);
  const logs = await fetchOptions.getLogs({
    noTarget: true,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.event_swap,
    entireLog: true,
  })
  logs.forEach((log: any) => {
    const pool = (log.address || log.source).toLowerCase()
    if (!aeroPoolSet.has(pool)) return;
    const { tokens, fee, protocolShare, hasGauge } = poolInfoMap[pool]
    const [token0, token1] = tokens
    const parsedLog = iface.parseLog(log)
    const amount0 = Number(parsedLog!.args.amount0In) + Number(parsedLog!.args.amount0Out)
    const amount1 = Number(parsedLog!.args.amount1In) + Number(parsedLog!.args.amount1Out)
    const fee0 = amount0 * fee
    const fee1 = amount1 * fee
    addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    addOneToken({ chain, balances: supplySideRevenue, token0, token1, amount0: fee0 * (1 - protocolShare), amount1: fee1 * (1 - protocolShare) })
    // gauged pairs stream their protocol share to voters, ungauged ones to the treasury
    const protocolShareBalances = hasGauge ? holdersRevenue : protocolRevenue
    addOneToken({ chain, balances: protocolShareBalances, token0, token1, amount0: fee0 * protocolShare, amount1: fee1 * protocolShare })
  })

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  
  dailyFees.addBalances(protocolRevenue, 'Token Swap Fees')
  dailyFees.addBalances(supplySideRevenue, 'Token Swap Fees')
  dailyFees.addBalances(holdersRevenue, 'Token Swap Fees')

  dailyRevenue.addBalances(protocolRevenue, 'Token Swap Fees To Protocol')
  dailyRevenue.addBalances(holdersRevenue, 'Token Swap Fees To Holders')

  dailyHoldersRevenue.addBalances(holdersRevenue, 'Token Swap Fees To Holders')

  dailyProtocolRevenue.addBalances(protocolRevenue, 'Token Swap Fees To Protocol')

  dailySupplySideRevenue.addBalances(supplySideRevenue, 'Token Swap Fees To LPs')
  
  return { 
    dailyVolume, 
    dailyFees,
    dailyUserFees: dailyFees, 
    dailyRevenue, 
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue, 
  }
}
const methodology = {
  Fees: "Swap fees paid by traders on Shadow legacy pools.",
  UserFees: "Swap fees paid by traders on Shadow legacy pools.",
  Revenue: "The share of swap fees taken from liquidity providers. Each pool sets its own share: pools with a gauge send it to xSHADOW holders who voted for them, pools without a gauge send it to the treasury.",
  ProtocolRevenue: "The share of swap fees sent to the treasury by pools that have no gauge.",
  HoldersRevenue: "The share of swap fees sent to xSHADOW holders by pools that have a gauge.",
  SupplySideRevenue: "The share of swap fees kept by liquidity providers. It is whatever each pool does not route to holders or the treasury: nothing in pools that give the whole fee away, 95% in pools that take a 5% cut.",
};

const breakdownMethodology = {
  Fees: {
    'Token Swap Fees': 'Swap fees paid by traders on Shadow legacy pools.',
  },
  UserFees: {
    'Token Swap Fees': 'Swap fees paid by traders on Shadow legacy pools.',
  },
  Revenue: {
    'Token Swap Fees To Protocol': 'Swap fees sent to the treasury by pools that have no gauge.',
    'Token Swap Fees To Holders': 'Swap fees sent to xSHADOW holders by pools that have a gauge.',
  },
  ProtocolRevenue: {
    'Token Swap Fees To Protocol': 'Swap fees sent to the treasury by pools that have no gauge.',
  },
  HoldersRevenue: {
    'Token Swap Fees To Holders': 'Swap fees sent to xSHADOW holders by pools that have a gauge.',
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': 'The share of swap fees each pool leaves with its liquidity providers.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.SONIC],
  start: '2025-01-15',
}
export default adapter;
