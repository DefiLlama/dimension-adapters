import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, IJSON, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from '../helpers/prices';
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";
import { filterPools } from '../helpers/uniswap';

// Fee split source: https://docs.shadow.so/pages/x-33#fee-split

const CONFIG = {
  factory: '0x2dA25E7446A70D7be65fd4c053948BEcAA6374c8',
  voter: '0x9f59398d0a397b2eeb8a6123a6c7295cb0b0062d',
  treasury: '0xE25E95F75432A79D31256CC3026E24AAA5540882'
}
const eventAbis = {
  event_poolCreated: 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
  event_swap: 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  event_gaugeCreated: 'event GaugeCreated(address indexed gauge, address creator, address feeDistributor, address indexed pool)',
  event_notify_reward: 'event NotifyReward(address indexed from, address indexed reward, uint256 amount, uint256 period)',
}
const abis = {
  fee: 'uint256:fee'
}
const firstBlock = 4028276

export const getBribes = async (fetchOptions: FetchOptions, gaugeCreatedEvent: string, voter: string, factory: string): Promise<{ dailyBribesRevenue: sdk.Balances }> => {
  const { createBalances, getLogs } = fetchOptions
  const iface = new ethers.Interface([eventAbis.event_notify_reward]);
  const dailyBribesRevenue = createBalances()
  const logs_gauge_created = await getLogs({ target: voter, fromBlock: firstBlock, eventAbi: gaugeCreatedEvent, onlyArgs: false, cacheInCloud: true })
  if (!logs_gauge_created?.length) return { dailyBribesRevenue };
  const bribes_contract = logs_gauge_created
    .filter((log) => (log.address || log.source).toLowerCase() === voter.toLowerCase())
  const pools = bribes_contract.map(log => log.args.pool.toLowerCase())
  const poolsFactories = (await fetchOptions.api.multiCall({ abi: 'address:factory', calls: pools }))
  const bribes_contracts_v2 = bribes_contract.filter((_, index) => poolsFactories[index].toLowerCase() === factory.toLowerCase()).map((log) => log.args.feeDistributor.toLowerCase())
  const bribeSet = new Set(bribes_contracts_v2)

  const logs = await getLogs({ noTarget: true, topic: '0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b', entireLog: true })
  logs.forEach((log: any) => {
    const contract = (log.address || log.source).toLowerCase()
    if (!bribeSet.has(contract)) return;
    const parsedLog = iface.parseLog(log)
    const token = parsedLog!.args.reward
    const amount = parsedLog!.args.amount
    dailyBribesRevenue.add(token, amount)
  })
  return { dailyBribesRevenue }
}

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getToBlock, getFromBlock, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const gaugedFees = createBalances()
  const supplySideFees = createBalances()
  const protocolFees = createBalances()
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${CONFIG.factory.toLowerCase()}-${chain}.json`
  const { pairs, token0s, token1s } = await sdk.cache.readCache(cacheKey, { readFromR2Cache: true })
  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const filteredPools = await filterPools({ api: api, pairs: pairObject, createBalances: createBalances })
  const poolAddresses = Object.keys(filteredPools)
  const fees = await api.multiCall({ abi: abis.fee, calls: poolAddresses })
  const feeRecipients = await api.multiCall({ abi: 'address:feeRecipient', calls: poolAddresses })
  const aeroPoolSet = new Set()
  const poolInfoMap = {} as any
  poolAddresses.forEach((pair, index) => {
    const pool = pair.toLowerCase()
    const fee = fees[index] / 1e6
    const hasGauge = feeRecipients[index] !== CONFIG.treasury
    poolInfoMap[pool] = { tokens: pairObject[pair], fee, hasGauge }
    aeroPoolSet.add(pool)
  })

  const blockStep = 1000;
  let i = 0;
  let startBlock = fromBlock;
  let ranges: any = []
  const iface = new ethers.Interface([eventAbis.event_swap]);


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
        const logs = await fetchOptions.getLogs({
          noTarget: true,
          fromBlock: startBlock,
          toBlock: endBlock,
          eventAbi: eventAbis.event_swap,
          entireLog: true,
        })
        logs.forEach((log: any) => {
          const pool = (log.address || log.source).toLowerCase()
          if (!aeroPoolSet.has(pool)) return;
          const { tokens, fee, hasGauge } = poolInfoMap[pool]
          const [token0, token1] = tokens
          const parsedLog = iface.parseLog(log)
          const amount0 = Number(parsedLog!.args.amount0In) + Number(parsedLog!.args.amount0Out)
          const amount1 = Number(parsedLog!.args.amount1In) + Number(parsedLog!.args.amount1Out)
          const fee0 = amount0 * fee
          const fee1 = amount1 * fee
          addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
          if (hasGauge) {
            addOneToken({ chain, balances: gaugedFees, token0, token1, amount0: fee0, amount1: fee1 })
          }
          else {
            addOneToken({ chain, balances: supplySideFees, token0, token1, amount0: fee0 * 0.95, amount1: fee1 * 0.95 })
            addOneToken({ chain, balances: protocolFees, token0, token1, amount0: fee0 * 0.05, amount1: fee1 * 0.05 })
          }
        })
      } catch (e) {
        errorFound = true
        throw e
      }
    })

  if (errorFound) throw errorFound

  const { dailyBribesRevenue } = await getBribes(fetchOptions, eventAbis.event_gaugeCreated, CONFIG.voter, CONFIG.factory)

  const dailyHoldersRevenue = createBalances()
  dailyHoldersRevenue.addBalances(gaugedFees, 'Gauged Pool Fees')

  const dailySupplySideRevenue = createBalances()
  dailySupplySideRevenue.addBalances(supplySideFees, 'Swap Fees To LPs')

  const dailyProtocolRevenue = createBalances()
  dailyProtocolRevenue.addBalances(protocolFees, 'Protocol Fee')

  // UserFees = all user-paid swap fees (before external bribes)
  const dailyUserFees = dailyHoldersRevenue.clone(1)
  dailyUserFees.addBalances(dailySupplySideRevenue)
  dailyUserFees.addBalances(dailyProtocolRevenue)

  // Snapshot pre-bribe holders revenue for fee/revenue rollups
  const feeDerivedHoldersRevenue = dailyHoldersRevenue.clone(1)
  // External bribes only in holdersRevenue, not in fees/revenue
  dailyHoldersRevenue.addBalances(dailyBribesRevenue, 'Voting Bribes')

  const dailyRevenue = dailyProtocolRevenue.clone(1)
  dailyRevenue.addBalances(feeDerivedHoldersRevenue)

  const dailyFees = dailyRevenue.clone(1)
  dailyFees.addBalances(dailySupplySideRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}
const methodology = {
  Fees: "Swap fees paid by traders on all pools.",
  UserFees: "Swap fees paid by traders.",
  ProtocolRevenue: "5% of non-gauged pool fees going to the protocol treasury.",
  HoldersRevenue: "Fees from gauged pools and voting bribes distributed to xSHADOW holders.",
  SupplySideRevenue: "95% of non-gauged pool fees distributed to LPs.",
};

const breakdownMethodology = {
  Fees: {
    'Gauged Pool Fees': 'Swap fees from gauge-enabled pools.',
    'Swap Fees To LPs': '95% of swap fees from non-gauged pools distributed to LPs.',
    'Protocol Fee': '5% of swap fees from non-gauged pools going to the protocol treasury.',
  },
  UserFees: {
    'Gauged Pool Fees': 'Swap fees paid by traders on gauge-enabled pools.',
    'Swap Fees To LPs': 'Swap fees paid by traders on non-gauged pools (LP portion).',
    'Protocol Fee': 'Swap fees paid by traders on non-gauged pools (protocol portion).',
  },
  Revenue: {
    'Gauged Pool Fees': 'Swap fees from gauged pools distributed to xSHADOW holders.',
    'Protocol Fee': '5% of swap fees from non-gauged pools going to the protocol treasury.',
  },
  HoldersRevenue: {
    'Gauged Pool Fees': 'Swap fees from gauged pools distributed to xSHADOW holders.',
    'Voting Bribes': 'External incentives deposited by protocols to attract xSHADOW voter liquidity.',
  },
  SupplySideRevenue: {
    'Swap Fees To LPs': '95% of swap fees from non-gauged pools distributed to LPs.',
  },
  ProtocolRevenue: {
    'Protocol Fee': '5% of swap fees from non-gauged pools going to the protocol treasury.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.SONIC],
  start: '2025-02-02',
}
export default adapter;
