import ADDRESSES from './coreAssets.json'

import { Balances, ChainApi, cache } from "@defillama/sdk";
import { BaseAdapter, FetchOptions, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { addOneToken, isCoreAsset } from "./prices";
import { queryDune } from "./dune";
import { httpGet } from "../utils/fetchURL";
import { ethers } from "ethers";

const ZERO_ADDRESS = ADDRESSES.null;

// Wash-trade detection shared by the uniswap v3/v4 adapters: a pool is flagged
// when a day's flow comes from too few distinct addresses to be organic.
// Always measured over the whole UTC day - both adapters run hourly, and over a
// one-hour window a wash pool's fixed address set makes the ratios collapse.

// Test A: trades per EOA. Catches bot pools of any size, including unpriced ones.
export const WASH_MIN_TRADES = 500;
export const WASH_TRADES_PER_EOA = 100;

// Test B (ORed with A): USD per EOA. Fake-ticker pools move $725k-$3.9M per
// address vs ~$95k for the busiest organic pool measured; A misses most of them
// because they use fewer, larger trades. The trades/EOA floor is what keeps
// Ethereum PYUSD/USDS ($1.5M per address, 3 trades each) out of it.
export const WASH_MIN_USD = 1_000_000;
export const WASH_USD_PER_EOA = 500_000;
export const WASH_USD_MIN_TRADES_PER_EOA = 30;

// Priced-but-dust pools are never flagged: bot churn on Zora creator coins and
// the like trips test A while moving negligible USD, so dropping them buys no
// accuracy and mislabels legit long-tail activity. Pools dex.trades cannot
// price at all (SUM(amount_usd) IS NULL) stay flagged - catching those is what
// test A is for.
export const WASH_DUST_USD = 25_000;

// UTC day containing the inclusive end snapshot.
export function washDayStart(options: FetchOptions): number {
  return Math.floor((options.endTimestamp - 1) / 86400) * 86400;
}

// The day's wash-flagged pool set for one project+chain, for adapters whose
// pools are their own contracts in dex.trades (uniswap-v3 style). The caller's
// prefetch stores it and fetch drops those pools unless getEstablishedTokens
// clears every side. A Dune failure throws - reporting unfiltered would
// republish the wash volume as real.
export async function getWashPools(options: FetchOptions, { blockchain, project, version }: { blockchain: string; project: string; version?: string }): Promise<Set<string>> {
  const dayStart = washDayStart(options);
  const fullQuery = `
    SELECT CAST(project_contract_address AS VARCHAR) AS pool
    FROM dex.trades
    WHERE blockchain = '${blockchain}'
      AND project = '${project}'
      ${version ? `AND version = '${version}'` : ''}
      AND block_time >= from_unixtime(${dayStart})
      AND block_time < from_unixtime(${dayStart + 86400})
    GROUP BY project_contract_address
    HAVING ((
      COUNT(*) >= ${WASH_MIN_TRADES}
      AND COUNT(*) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_TRADES_PER_EOA}
    ) OR (
      COALESCE(SUM(amount_usd), 0) >= ${WASH_MIN_USD}
      AND COALESCE(SUM(amount_usd), 0) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_USD_PER_EOA}
      AND COUNT(*) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_USD_MIN_TRADES_PER_EOA}
    ))
    AND NOT (SUM(amount_usd) IS NOT NULL AND SUM(amount_usd) < ${WASH_DUST_USD})`;

  const rows: any[] = await queryDune('3996608', { fullQuery }, options, { extraUIDKey: 'wash' });
  return new Set(rows.map((r) => String(r.pool ?? '').toLowerCase()).filter(Boolean));
}

// Never flag a pool whose every side is established, meaning either
//  - a core asset: concentrated flow on a major/stable pair is just arb bots
//    (xlayer stablecoin pools peak at 90 trades/EOA, optimism native/USDC at
//    51), or
//  - a CoinGecko-listed token per our own price feed: a real project (SOSO,
//    DUAL, SBC...) whose MM/relayer churn is concentrated but not fake, and a
//    day-one rug cannot get a CG listing. Listed tokens price at confidence
//    0.99; the fake-ticker tokens return no price at all. Current listing also
//    exonerates past days on refills - a token listed today was real then too.
// Dune has no equivalent signal: prices.day covers anything that trades
// (source='dex.trades', fakes included) and its coinpaprika subset is ~200
// tokens per chain. A price-API failure throws rather than guessing either way.
export async function getEstablishedTokens(chain: string, tokens: string[]): Promise<Set<string>> {
  const established = new Set<string>();
  const unknown = new Set<string>();
  for (const token of tokens.map(t => t.toLowerCase())) {
    if (token === ZERO_ADDRESS || isCoreAsset(chain, token)) established.add(token);
    else unknown.add(token);
  }
  const pending = [...unknown];
  for (let i = 0; i < pending.length; i += 100) {
    const keys = pending.slice(i, i + 100).map(t => `${chain}:${t}`).join(',');
    const { coins } = await httpGet(`https://coins.llama.fi/prices/current/${keys}?searchWidth=6h`);
    for (const [key, info] of Object.entries(coins ?? {}) as [string, any][]) {
      if ((info?.confidence ?? 0) >= 0.9) established.add(key.split(':')[1].toLowerCase());
    }
  }
  return established;
}

export async function filterPools({ api, pairs, createBalances, maxPairSize = 42, minUSDValue = 200 }: { api: ChainApi, pairs: IJSON<string[]>, createBalances: any, maxPairSize?: number, minUSDValue?: number }): Promise<IJSON<number>> {
  const balanceCalls = Object.entries(pairs).map(([pair, tokens]) => tokens.map(i => ({ target: i, params: pair }))).flat()
  const res = await api.multiCall({ abi: 'erc20:balanceOf', calls: balanceCalls, permitFailure: true, })
  if (balanceCalls.length && res.every((bal) => bal == null))
    throw new Error(`filterPools: every pooled balance call failed on ${api.chain}, refusing to report ${Object.keys(pairs).length} pools as empty`)
  const balances: Balances = createBalances()
  const pairBalances: IJSON<Balances> = {}
  res.forEach((bal, i) => {
    balances.add(balanceCalls[i].target, bal)
    if (!pairBalances[balanceCalls[i].params]) {
      pairBalances[balanceCalls[i].params] = createBalances()
    }
    pairBalances[balanceCalls[i].params].add(balanceCalls[i].target, bal ?? 0)
  })
  // we do this to cache price results
  await balances.getUSDValue()
  const filteredPairs: IJSON<number> = {}
  for (const pair of Object.keys(pairs)) {
    const pooledValue = await pairBalances[pair].getUSDValue()
    if (pooledValue < minUSDValue)
      continue;
    filteredPairs[pair] = pooledValue
  }

  if (Object.keys(filteredPairs).length < maxPairSize)
    return filteredPairs

  // if there are more than 21 pools, we need to filter out the ones with the lowest value
  const sortedPairs = Object.entries(filteredPairs).sort((a, b) => b[1] - a[1]).slice(0, maxPairSize)
  return Object.fromEntries(sortedPairs)
}

function filterBlacklistedPools(pairObject: IJSON<string[]>, blacklistPools?: string[]): IJSON<string[]> {
  if (!blacklistPools?.length) return pairObject

  const blacklistPoolsSet = new Set(blacklistPools.map(i => i.toLowerCase()))
  const pairsToFilter: typeof pairObject = { ...pairObject }
  Object.keys(pairsToFilter).forEach(pair => {
    if (blacklistPoolsSet.has(pair.toLowerCase())) delete pairsToFilter[pair]
  })
  return pairsToFilter
}

const defaultV2SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'
const notifyRewardEvent = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';

export const getUniV2LogAdapter: any = (v2Config: UniV2Config): FetchV2 => {
  let { factory, fees = 0.003, swapEvent = defaultV2SwapEvent, stableFees = 1 / 10000, voter, maxPairSize, customLogic, blacklistedAddresses, userFeesRatio, revenueRatio, protocolRevenueRatio, holdersRevenueRatio, blacklistPools, allowReadPairs } = v2Config
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, chain, api } = fetchOptions
    let blacklistedAddressesSet: any
    if (blacklistedAddresses) {
      blacklistedAddressesSet = new Set(blacklistedAddresses.map(i => i.toLowerCase()))
    }

    if (!chain) throw new Error('Wrong version?')


    factory = factory.toLowerCase()
    const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`

    let { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    if (!pairs?.length) {
      if (!allowReadPairs) {
        throw new Error('No pairs found, is there TVL adapter for this already?')
      } else {
        const pairLength = await fetchOptions.api.call({ target: factory, abi: 'uint256:allPairsLength' })
        if (pairLength && Number(pairLength) > 0) {
          const calls = []
          for (let i = 0; i < Number(pairLength); i++) {
            calls.push({ target: factory, params: [i] })
          }
          pairs = await fetchOptions.api.multiCall({ abi: 'function allPairs(uint256) public view returns (address)', calls })
          token0s = await fetchOptions.api.multiCall({ abi: 'address:token0', calls: pairs })
          token1s = await fetchOptions.api.multiCall({ abi: 'address:token1', calls: pairs })
        }
      }
    }

    const pairObject: IJSON<string[]> = {}
    pairs.forEach((pair: string, i: number) => {
      pairObject[pair] = [token0s[i], token1s[i]]
    })
    const dailyVolume = createBalances()
    const swapFees = createBalances()
    const blacklistPoolsSet = blacklistPools ? new Set(blacklistPools.map(i => i.toLowerCase())) : null
    const pairsToFilter = filterBlacklistedPools(pairObject, blacklistPools)
    const filteredPairs = await filterPools({ api, pairs: pairsToFilter, createBalances, maxPairSize })
    const pairIds = Object.keys(filteredPairs)
    api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${factory} Chain: ${chain}`)
    const isStablePair = await api.multiCall({ abi: 'bool:stable', calls: pairIds, permitFailure: true })

    if (!pairIds.length) return {
      dailyVolume,
      dailyFees: swapFees,
      dailyUserFees: userFeesRatio !== undefined ? 0 : undefined,
      dailyRevenue: revenueRatio !== undefined ? 0 : undefined,
      dailySupplySideRevenue: revenueRatio !== undefined ? 0 : undefined,
      dailyProtocolRevenue: protocolRevenueRatio !== undefined ? 0 : undefined,
      dailyHoldersRevenue: holdersRevenueRatio !== undefined ? 0 : undefined,
    }

    const allLogs = await getLogs({ targets: pairIds, eventAbi: swapEvent, flatten: false })
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = pairIds[index]
      if (blacklistPoolsSet && blacklistPoolsSet.has(pair.toLowerCase())) return;
      let _fees = isStablePair[index] ? stableFees : fees
      const [token0, token1] = pairObject[pair]
      logs.forEach((log: any) => {
        if (blacklistedAddressesSet) {
          if (
            blacklistedAddressesSet.has(log.sender.toLowerCase()) ||
            blacklistedAddressesSet.has(log.to.toLowerCase()))
            return;
        }
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
        addOneToken({ chain, balances: swapFees, token0, token1, amount0: Number(log.amount0In) * _fees, amount1: Number(log.amount1In) * _fees })
        addOneToken({ chain, balances: swapFees, token0, token1, amount0: Number(log.amount0Out) * _fees, amount1: Number(log.amount1Out) * _fees })
      })
    })

    if (customLogic)
      return customLogic({ pairObject, dailyVolume, dailyFees: swapFees, filteredPairs, fetchOptions })

    const dailyFees = swapFees.clone(1, 'Token Swap Fees');

    if (voter) {
      const dailyBribesRevenue = createBalances()
      const bribeContracts: string[] = await api.multiCall({ abi: 'function gauges(address) view returns (address)', calls: pairIds, target: voter })
      let feesVotingReward: string[] = await api.multiCall({ abi: 'address:feesVotingReward', calls: bribeContracts, permitFailure: true })
      if (feesVotingReward.filter((e: any) => e).length === 0) {
        api.log('No feesVotingReward found, trying bribes')
        feesVotingReward = bribeContracts
      }
      api.log(bribeContracts.length, 'bribes contracts found')

      const logs = await getLogs({ targets: feesVotingReward.filter(i => i !== ZERO_ADDRESS), eventAbi: notifyRewardEvent, })

      logs.map((e: any) => {
        dailyBribesRevenue.add(e.reward, e.amount)
      })

      dailyFees.add(dailyBribesRevenue, 'Bribes Rewards')

      return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
    }

    const response: any = { dailyVolume, dailyFees }

    if (revenueRatio || revenueRatio === 0) {
      response.dailyRevenue = dailyFees.clone(revenueRatio, 'Protocol fees')
      response.dailySupplySideRevenue = dailyFees.clone(1 - revenueRatio, 'LP fees')
    }
    if (v2Config.hasOwnProperty('userFeesRatio')) response.dailyUserFees = dailyFees.clone(userFeesRatio, 'Trading fees')
    if (v2Config.hasOwnProperty('protocolRevenueRatio')) response.dailyProtocolRevenue = dailyFees.clone(protocolRevenueRatio, 'Protocol fees')
    if (v2Config.hasOwnProperty('holdersRevenueRatio')) response.dailyHoldersRevenue = dailyFees.clone(holdersRevenueRatio, 'Tokenholder fees')

    return response
  }
  return fetch
}

const defaultV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const defaultPoolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const defaultAlgebraV3PoolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
// Algebra Constants.COMMUNITY_FEE_DENOMINATOR, same on V1.9 and Integral
const COMMUNITY_FEE_DENOMINATOR = 1e3

export const getUniV3LogAdapter: any = ({ factory, poolCreatedEvent, swapEvent = defaultV3SwapEvent, customLogic, isAlgebraV3 = false, isAlgebraV2 = false, userFeesRatio, revenueRatio, protocolRevenueRatio, holdersRevenueRatio, blacklistPools, pools, getRevenueRatio, dynamicProtocolFees = false, algebraCommunityFee = false }: UniV3Config): FetchV2 => {
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, chain, api } = fetchOptions
    const pairObject: IJSON<string[]> = {}
    const fees: any = {}
    const communityFees: IJSON<number> = {}

    if (!chain) throw new Error('Wrong version?')

    if (factory) {

      // Determine which event to use based on parameters
      // If poolCreatedEvent is explicitly passed, use it
      // Otherwise, use algebra default for algebra or standard default for others
      const eventToUse = poolCreatedEvent ?? (isAlgebraV3 ? defaultAlgebraV3PoolCreatedEvent : defaultPoolCreatedEvent)

      factory = factory.toLowerCase()
      const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${factory}.json`
      const iface = new ethers.Interface([eventToUse])
      let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
      if (!logs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')

      // bad rpcs return bad log with undefined format, filter them out
      logs = logs.map((log: any) => iface.parseLog(log)?.args).filter((log: any) => !!log)

      logs.forEach((log: any) => {
        pairObject[log.pool] = [log.token0, log.token1]
        fees[log.pool] = (log.fee?.toString() || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
      })

      if (isAlgebraV3) {
        let _fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: logs.map((log: any) => log.pool), permitFailure: true })
        _fees.forEach((fee: any, i: number) => { if (fee != null) fees[logs[i].pool] = fee / 1e6 })
      }
      if (isAlgebraV2) {
        let _states = await api.multiCall({ abi: 'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint16 communityFeeToken0, uint16 communityFeeToken1, bool unlocked)', calls: logs.map((log: any) => log.pool), permitFailure: true })
        _states.forEach((state: any, i: number) => { if (state != null) fees[logs[i].pool] = Number(state.fee) / 1e6 })
      }

      // share of swap fees the protocol keeps, stored in the pool's globalState:
      // 6th value on Algebra V1/V1.9 pools, 5th on Algebra Integral pools
      if (algebraCommunityFee) {
        const abi = isAlgebraV3
          ? 'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee)'
          : 'function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint16 communityFee)'
        const _states = await api.multiCall({ abi, calls: logs.map((log: any) => log.pool), permitFailure: true })
        _states.forEach((state: any, i: number) => { if (state != null) communityFees[logs[i].pool] = Number(state.communityFee) / COMMUNITY_FEE_DENOMINATOR })
      }
    } else if (Array.isArray(pools)) {

      pools = pools.map(i => i.toLowerCase())
      const _fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: pools, permitFailure: true })
      const token0s = await api.multiCall({ abi: 'address:token0', calls: pools, permitFailure: true })
      const token1s = await api.multiCall({ abi: 'address:token1', calls: pools, permitFailure: true })
      pools.forEach((pool: string, i: number) => {
        if (!token0s[i] || !token1s[i] || !_fees[i]) return; // skip if any call failed
        fees[pool] = _fees[i] / 1e6
        pairObject[pool] = [token0s[i], token1s[i]]
      })
    } else {
      throw new Error('Either factory or pools must be provided in the config')
    }

    const blacklistPoolsSet = blacklistPools ? new Set(blacklistPools.map(i => i.toLowerCase())) : null
    const pairsToFilter = filterBlacklistedPools(pairObject, blacklistPools)
    const filteredPairs = await filterPools({ api, pairs: pairsToFilter, createBalances })
    const dailyVolume = createBalances()
    const swapFees = createBalances()
    const revenue = createBalances()
    const supplySideRevenue = createBalances()
    const protocolRevenue = createBalances()
    const holdersRevenue = createBalances()

    let revenueEnabled = false;
    let protocolRevenueEnabled = false;
    let holdersRevenueEnabled = false;

    if (!Object.keys(filteredPairs).length) return {
      dailyVolume,
      dailyFees: swapFees,
      dailyUserFees: userFeesRatio !== undefined ? 0 : undefined,
      dailyRevenue: revenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
      dailySupplySideRevenue: revenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
      dailyProtocolRevenue: protocolRevenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
      dailyHoldersRevenue: holdersRevenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
    }

    const pairs = Object.keys(filteredPairs)
    const protocolFeeRatios: IJSON<{ token0: number, token1: number }> = {}

    if (dynamicProtocolFees) {
      const slot0Results = await api.multiCall({
        abi: "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
        calls: pairs,
        permitFailure: true,
      })

      slot0Results.forEach((slot0: any, i: number) => {
        const feeProtocol = Number(slot0?.feeProtocol ?? 0)
        const token0Denominator = feeProtocol & 0x0f
        const token1Denominator = (feeProtocol >> 4) & 0x0f

        protocolFeeRatios[pairs[i]] = {
          token0: token0Denominator > 0 ? 1 / token0Denominator : 0,
          token1: token1Denominator > 0 ? 1 / token1Denominator : 0,
        }
      })
    }

    const allLogs = await getLogs({ targets: pairs, eventAbi: swapEvent, flatten: false })

    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = pairs[index]
      if (blacklistPoolsSet && blacklistPoolsSet.has(pair.toLowerCase())) return;
      const [token0, token1] = pairObject[pair]
      const feeTier = fees[pair]

      let pairRevenueRatio = revenueRatio;
      let pairProtocolRevenueRatio = protocolRevenueRatio;
      let pairHoldersRevenueRatio = holdersRevenueRatio;

      // only use custom revenue ratio when revenueRatio is not set
      if (revenueRatio === undefined && getRevenueRatio) {
        const { _revenueRatio, _protocolRevenueRatio, _holdersRevenueRatio } = getRevenueRatio({
          options: fetchOptions,
          poolFeeTier: feeTier,
          protocolFeeRatioToken0: dynamicProtocolFees ? protocolFeeRatios[pair]?.token0 : undefined,
          protocolFeeRatioToken1: dynamicProtocolFees ? protocolFeeRatios[pair]?.token1 : undefined,
          communityFeeRatio: algebraCommunityFee ? communityFees[pair] : undefined,
        })

        if (!pairRevenueRatio) pairRevenueRatio = _revenueRatio;
        if (!pairProtocolRevenueRatio && _protocolRevenueRatio) pairProtocolRevenueRatio = _protocolRevenueRatio;
        if (!pairHoldersRevenueRatio && _holdersRevenueRatio) pairHoldersRevenueRatio = _holdersRevenueRatio;
      }

      logs.forEach((log: any) => {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
        const { token: _token, amount: _feeAmount } = addOneToken({ chain, balances: swapFees, token0, token1, amount0: log.amount0.toString() * feeTier, amount1: log.amount1.toString() * feeTier })

        if (pairRevenueRatio || pairRevenueRatio === 0) {
          revenueEnabled = true;
          revenue.add(_token, _feeAmount * pairRevenueRatio);
          supplySideRevenue.add(_token, _feeAmount * (1 - pairRevenueRatio));
        }
        if (pairProtocolRevenueRatio || pairProtocolRevenueRatio === 0) {
          protocolRevenueEnabled = true;
          protocolRevenue.add(_token, _feeAmount * pairProtocolRevenueRatio);
        }
        if (pairHoldersRevenueRatio || pairHoldersRevenueRatio === 0) {
          holdersRevenueEnabled = true;
          holdersRevenue.add(_token, _feeAmount * pairHoldersRevenueRatio);
        }
      })
    })

    if (customLogic) {
      return customLogic({ pairObject, dailyVolume, dailyFees: swapFees, filteredPairs, fetchOptions })
    }

    const dailyFees = swapFees.clone(1, 'Token Swap Fees')
    const response: any = { dailyVolume, dailyFees }

    if (userFeesRatio || userFeesRatio === 0) response.dailyUserFees = dailyFees.clone(userFeesRatio, 'Trading fees')

    if (revenueEnabled) {
      response.dailyRevenue = revenue.clone(1, 'Protocol fees');
      response.dailySupplySideRevenue = supplySideRevenue.clone(1, 'LP fees');
    }

    if (protocolRevenueEnabled) response.dailyProtocolRevenue = protocolRevenue.clone(1, 'Protocol fees')
    if (holdersRevenueEnabled) response.dailyHoldersRevenue = holdersRevenue.clone(1, 'Tokenholder fees')

    return response
  }
  return fetch
}

type UniV2Config = {
  factory: string,
  fees?: number,
  swapEvent?: string,
  stableFees?: number,
  voter?: string,
  maxPairSize?: number,
  customLogic?: any,
  start?: string,
  blacklistedAddresses?: string[],
  userFeesRatio?: number,
  revenueRatio?: number,
  protocolRevenueRatio?: number,
  holdersRevenueRatio?: number,
  blacklistPools?: Array<string>,
  allowReadPairs?: boolean;
}

export interface UniGetRevenueRatioProps {
  options: FetchOptions;
  poolFeeTier: number;
  protocolFeeRatioToken0?: number;
  protocolFeeRatioToken1?: number;
  // Algebra community fee, as a share of the pool's swap fees
  communityFeeRatio?: number;
}

type UniV3Config = {
  factory: string,
  poolCreatedEvent?: string,
  swapEvent?: string,
  customLogic?: any,
  isAlgebraV3?: boolean,
  isAlgebraV2?: boolean,
  userFeesRatio?: number,
  revenueRatio?: number,
  protocolRevenueRatio?: number,
  holdersRevenueRatio?: number,
  start?: string,
  deadFrom?: string,
  blacklistPools?: Array<string>,
  pools?: string[], // alternative to providing factory
  dynamicProtocolFees?: boolean,
  // read each Algebra pool's community fee and pass it to getRevenueRatio
  algebraCommunityFee?: boolean,

  // support to get custom revenue ratio from given pool fee tier
  getRevenueRatio?: (props: UniGetRevenueRatioProps) => { _revenueRatio: number, _protocolRevenueRatio?: number, _holdersRevenueRatio?: number };
}

export function uniV2Exports(config: IJSON<UniV2Config>, { runAsV1 = false, pullHourly = true, ...otherRootOptions } = {}) {
  const exportObject: BaseAdapter = {}


  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = { fetch: getUniV2LogAdapter(chainConfig), start: chainConfig.start }
  })


  if (runAsV1)
    return { adapter: exportObject, version: 1, } as SimpleAdapter


  return { ...otherRootOptions, adapter: exportObject, version: 2, pullHourly, } as SimpleAdapter
}

export function uniV3Exports(config: IJSON<UniV3Config>, { runAsV1 = false, swapEvent, pullHourly = true, ...otherRootOptions }: {
  runAsV1?: boolean,
  swapEvent?: string,
  pullHourly?: boolean,
  [key: string]: any
} = {}) {
  const exportObject: BaseAdapter = {}

  Object.entries(config).map(([chain, chainConfig]) => {
    if (swapEvent) chainConfig.swapEvent = swapEvent
    const fetch: any = getUniV3LogAdapter(chainConfig)
    exportObject[chain] = { fetch, start: chainConfig.start }
    if (chainConfig.deadFrom) exportObject[chain].deadFrom = chainConfig.deadFrom
  })

  if (runAsV1)
    return { adapter: exportObject, version: 1 } as SimpleAdapter


  return { ...otherRootOptions, adapter: exportObject, version: 2, pullHourly, } as SimpleAdapter
}


export async function filterPools2({ fetchOptions, pairs, token0s, token1s, minUSDValue, maxPairSize }: any) {
  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const res = await filterPools({ ...fetchOptions, pairs: pairObject, minUSDValue, maxPairSize })
  pairs = []
  token0s = []
  token1s = []
  Object.keys(res).forEach((pair: any) => {
    pairs.push(pair)
    const [token0, token1] = pairObject[pair]
    token0s.push(token0)
    token1s.push(token1)
  })
  return { pairs, token0s, token1s, pairObject, }
}
