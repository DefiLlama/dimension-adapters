import { FetchOptions, SimpleAdapter, IJSON } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBribes } from "./shadow-legacy";
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";
import { addOneToken } from '../helpers/prices';
import { filterPools } from '../helpers/uniswap';
import * as sdk from '@defillama/sdk';

// Fee Split source: https://docs.shadow.so/pages/x-33#fee-split

const SHADOW_TOKEN_CONTRACT = "0x3333b97138d4b086720b5ae8a7844b1345a33333";
const XSHADOW_TOKEN_CONTRACT = "0x5050bc082FF4A74Fb6B0B04385dEfdDB114b2424";
const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  event_gaugeCreated: 'event GaugeCreated(address indexed gauge, address creator, address feeDistributor, address indexed pool)',
  event_notify_reward: 'event NotifyReward(address indexed from, address indexed reward, uint256 amount, uint256 period)',
}
const CONFIG = {
  factory: '0xcD2d0637c94fe77C2896BbCBB174cefFb08DE6d7',
  voter: '0x9f59398d0a397b2eeb8a6123a6c7295cb0b0062d',
}

const fetch = async (options: FetchOptions) => {
  const { api, createBalances, getToBlock, getFromBlock, chain, getLogs } = options
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyVolume = createBalances();
  const dailyHoldersRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()
  const dailyTokenTaxes = createBalances()
  const dailySupplySideRevenue = createBalances()
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])
  const poolsWithGauges = await api.call({ target: CONFIG.voter, abi: "address[]:getAllPools"}).then(contracts => contracts.map((contract: string) => contract.toLowerCase()))
  const poolsWithGaugesSet = new Set(poolsWithGauges)
  const InstantExitLogs = await getLogs({
    target: XSHADOW_TOKEN_CONTRACT,
    eventAbi: "event InstantExit(address indexed user, uint256 amount)",
    topic: "0xa8a63b0531e55ae709827fb089d01034e24a200ad14dc710dfa9e962005f629a",
  });
  let shadowPenaltyAmount = 0;

  for (const log of InstantExitLogs) {
    shadowPenaltyAmount += Number(log.amount) / 1e18;
  }

  // Calculate xSHADOW rebase revenue in USD
  dailyTokenTaxes.add(SHADOW_TOKEN_CONTRACT, shadowPenaltyAmount)
  dailyFees.add(SHADOW_TOKEN_CONTRACT, shadowPenaltyAmount)

  const iface = new ethers.Interface([eventAbis.event_poolCreated, eventAbis.event_swap])

  const pairObject: IJSON<string[]> = {}
  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${CONFIG.factory.toLowerCase()}.json`
  let { logs } = await sdk.cache.readCache(cacheKey, { readFromR2Cache: true })
  logs = logs.map((log: any) => iface.parseLog(log)?.args)
  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1]
  })

  const filteredPools = await filterPools({ api: api, pairs: pairObject, createBalances: createBalances})
  const poolAddresses = Object.keys(filteredPools)
  const fees = await api.multiCall({ abi: 'uint256:fee',  calls: poolAddresses })
  const aeroPoolSet = new Set()
  const poolInfoMap = {} as any
  poolAddresses.forEach((pair, index) => {
    const pool = pair.toLowerCase()
    const fee = fees[index] / 1e6
    const hasGauge = poolsWithGaugesSet.has(pool)
    poolInfoMap[pool] = { tokens: pairObject[pair], fee, hasGauge }
    aeroPoolSet.add(pool)
  })

  const blockStep = 1000;
  let startBlock = fromBlock;
  let ranges: any = []


  while (startBlock < toBlock) {
    const endBlock = Math.min(startBlock + blockStep - 1, toBlock)
    ranges.push([startBlock, endBlock])
    startBlock += blockStep
  }

  let errorFound = false


  await PromisePool
    .withConcurrency(5)
    .for(ranges)
    .process(async ([startBlock, endBlock]: any) => {
      if (errorFound) return;
      try {
        const logs = await getLogs({
          noTarget: true,
          fromBlock: startBlock,
          toBlock: endBlock,
          eventAbi: eventAbis.event_swap,
          entireLog: true,
          skipCache: true,
        })
        logs.forEach((log: any) => {
          const pool = (log.address || log.source).toLowerCase()
          if (!aeroPoolSet.has(pool)) return;
          const { tokens, fee, hasGauge } = poolInfoMap[pool]
          const [token0, token1] = tokens
          const parsedLog = iface.parseLog(log)
          const amount0 = Number(parsedLog!.args.amount0)
          const amount1 = Number(parsedLog!.args.amount1)
          const fee0 = amount0 * fee
          const fee1 = amount1 * fee
          addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
          if (hasGauge) {
            addOneToken({ chain, balances: dailyHoldersRevenue, token0, token1, amount0: fee0, amount1: fee1 })
          }
          else {
            addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: fee0 * 0.95, amount1: fee1 * 0.95 })
            addOneToken({ chain, balances: dailyProtocolRevenue, token0, token1, amount0: fee0 * 0.05, amount1: fee1 * 0.05 })
          }
        })
      } catch (e) {
        errorFound = true
        throw e
      }
    })

  if (errorFound) throw errorFound
  const { dailyBribesRevenue } = await getBribes(options, eventAbis.event_gaugeCreated, CONFIG.voter, CONFIG.factory)
  dailyRevenue.addBalances(dailyProtocolRevenue)
  dailyRevenue.addBalances(dailyHoldersRevenue)
  dailyFees.addBalances(dailyRevenue)
  dailyFees.addBalances(dailySupplySideRevenue)

  return { 
    dailyVolume, 
    dailyFees,
    dailyUserFees: dailyFees, 
    dailyRevenue, 
    dailyHoldersRevenue, 
    dailySupplySideRevenue,
    dailyProtocolRevenue, 
    dailyBribesRevenue 
  }
};

const methodology = {
  Fees: "User pays fees on each swap.",
  UserFees: "User pays fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
  BribesRevenue: "Bribes are distributed among holders.",
  SupplySideRevenue: "Fees distributed to LPs (from gauged pools).",
  TokenTax: "xSHADOW stakers instant exit penalty",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  fetch,
  chains: [CHAIN.SONIC],
  start: "2024-12-27"
};

export default adapter;
