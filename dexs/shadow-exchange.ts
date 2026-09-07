import { FetchOptions, SimpleAdapter, IJSON } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";
import { addOneToken } from '../helpers/prices';
import { filterPools } from '../helpers/uniswap';
import * as sdk from '@defillama/sdk';

const SHADOW_TOKEN_CONTRACT = "0x3333b97138d4b086720b5ae8a7844b1345a33333";
const XSHADOW_TOKEN_CONTRACT = "0x5050bc082FF4A74Fb6B0B04385dEfdDB114b2424";
const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
}
// Shadow stores feeProtocol as a plain percentage (0-100), not the uniswap-v3 packed nibble pair
const abis = {
  slot0: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
}
const CONFIG = {
  factory: '0xcD2d0637c94fe77C2896BbCBB174cefFb08DE6d7',
  voter: '0x9f59398d0a397b2eeb8a6123a6c7295cb0b0062d',
}

const fetch = async (options: FetchOptions) => {
  const { api, createBalances, getToBlock, getFromBlock, chain, getLogs } = options
  const dailyVolume = createBalances();
  const holdersRevenue = createBalances()
  const protocolRevenue = createBalances()
  const tokenTaxes = createBalances()
  const supplySideRevenue = createBalances()
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])
  const poolsWithGauges = (await api.call({ target: CONFIG.voter, abi: "address[]:getAllPools" }))
    .map((contract: string) => contract.toLowerCase())
  const poolsWithGaugesSet = new Set(poolsWithGauges)
  const InstantExitLogs = await getLogs({
    target: XSHADOW_TOKEN_CONTRACT,
    eventAbi: "event InstantExit(address indexed user, uint256 amount)",
    topic: "0xa8a63b0531e55ae709827fb089d01034e24a200ad14dc710dfa9e962005f629a",
  });
  // exit() emits the exited amount, which equals the 50% penalty streamed to xSHADOW holders
  for (const log of InstantExitLogs) {
    tokenTaxes.add(SHADOW_TOKEN_CONTRACT, log.amount)
  }

  const iface = new ethers.Interface([eventAbis.event_poolCreated, eventAbis.event_swap])

  const pairObject: IJSON<string[]> = {}
  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${CONFIG.factory.toLowerCase()}.json`
  let { logs } = await sdk.cache.readCache(cacheKey, { readFromR2Cache: true })
  logs = logs.map((log: any) => iface.parseLog(log)?.args)
  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1]
  })

  const filteredPools = await filterPools({ api: api, pairs: pairObject, createBalances: createBalances, maxPairSize: 500 })
  const poolAddresses = Object.keys(filteredPools)
  const fees = await api.multiCall({ abi: 'uint256:fee',  calls: poolAddresses })
  const slot0s = await api.multiCall({ abi: abis.slot0, calls: poolAddresses })
  const aeroPoolSet = new Set()
  const poolInfoMap = {} as any
  poolAddresses.forEach((pair, index) => {
    const pool = pair.toLowerCase()
    const fee = fees[index] / 1e6
    // share of the swap fee taken from LPs; the rest accrues to them via feeGrowthGlobal
    const protocolShare = Number(slot0s[index].feeProtocol) / 100
    const hasGauge = poolsWithGaugesSet.has(pool)
    poolInfoMap[pool] = { tokens: pairObject[pair], fee, protocolShare, hasGauge }
    aeroPoolSet.add(pool)
  })

  const swapLogs = await getLogs({
    noTarget: true,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.event_swap,
    entireLog: true,
  })
  swapLogs.forEach((log: any) => {
    const pool = (log.address || log.source).toLowerCase()
    if (!aeroPoolSet.has(pool)) return;
    const { tokens, fee, protocolShare, hasGauge } = poolInfoMap[pool]
    const [token0, token1] = tokens
    const parsedLog = iface.parseLog(log)
    const amount0 = Number(parsedLog!.args.amount0)
    const amount1 = Number(parsedLog!.args.amount1)
    const fee0 = amount0 * fee
    const fee1 = amount1 * fee
    addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    addOneToken({ chain, balances: supplySideRevenue, token0, token1, amount0: fee0 * (1 - protocolShare), amount1: fee1 * (1 - protocolShare) })
    // gauged pools stream their protocol share to voters, ungauged ones to the treasury
    const protocolShareBalances = hasGauge ? holdersRevenue : protocolRevenue
    addOneToken({ chain, balances: protocolShareBalances, token0, token1, amount0: fee0 * protocolShare, amount1: fee1 * protocolShare })
  })

  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyHoldersRevenue = createBalances()
  
  dailyFees.addBalances(tokenTaxes, 'Penalty Fees')
  dailyFees.addBalances(protocolRevenue, 'Token Swap Fees')
  dailyFees.addBalances(supplySideRevenue, 'Token Swap Fees')
  dailyFees.addBalances(holdersRevenue, 'Token Swap Fees')

  dailyRevenue.addBalances(protocolRevenue, 'Token Swap Fees To Protocol')
  dailyRevenue.addBalances(holdersRevenue, 'Token Swap Fees To Holders')
  dailyRevenue.addBalances(tokenTaxes, 'Penalty Fees')

  dailyHoldersRevenue.addBalances(holdersRevenue, 'Token Swap Fees To Holders')
  dailyHoldersRevenue.addBalances(tokenTaxes, 'Penalty Fees')

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
};

const methodology = {
  Fees: "Swap fees paid by traders on Shadow concentrated liquidity pools, plus the penalty paid by users who exit xSHADOW early.",
  UserFees: "Swap fees paid by traders on Shadow concentrated liquidity pools, plus the penalty paid by users who exit xSHADOW early.",
  Revenue: "The share of swap fees taken from liquidity providers, plus early exit penalties. Each pool sets its own share: pools with a gauge send it to xSHADOW holders who voted for them, pools without a gauge send it to the treasury.",
  ProtocolRevenue: "The share of swap fees sent to the treasury by pools that have no gauge.",
  HoldersRevenue: "The share of swap fees sent to xSHADOW holders by pools that have a gauge, plus the penalty paid by users who exit xSHADOW early, which is streamed to the remaining holders.",
  SupplySideRevenue: "The share of swap fees kept by liquidity providers. It is whatever each pool does not route to holders or the treasury: nothing in pools that give the whole fee away, 95% in pools that take a 5% cut.",
};

const breakdownMethodology = {
  Fees: {
    'Penalty Fees': 'Penalty paid by users who exit xSHADOW early.',
    'Token Swap Fees': 'Swap fees paid by traders on Shadow concentrated liquidity pools.',
  },
  UserFees: {
    'Penalty Fees': 'Penalty paid by users who exit xSHADOW early.',
    'Token Swap Fees': 'Swap fees paid by traders on Shadow concentrated liquidity pools.',
  },
  Revenue: {
    'Penalty Fees': 'Early exit penalties streamed to the remaining xSHADOW holders.',
    'Token Swap Fees To Protocol': 'Swap fees sent to the treasury by pools that have no gauge.',
    'Token Swap Fees To Holders': 'Swap fees sent to xSHADOW holders by pools that have a gauge.',
  },
  ProtocolRevenue: {
    'Token Swap Fees To Protocol': 'Swap fees sent to the treasury by pools that have no gauge.',
  },
  HoldersRevenue: {
    'Penalty Fees': 'Early exit penalties streamed to the remaining xSHADOW holders.',
    'Token Swap Fees To Holders': 'Swap fees sent to xSHADOW holders by pools that have a gauge.',
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': 'The share of swap fees each pool leaves with its liquidity providers.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  fetch,
  chains: [CHAIN.SONIC],
  start: "2024-12-27"
};

export default adapter;
