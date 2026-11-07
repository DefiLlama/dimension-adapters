// GMX v2 fees decoded from the EventEmitter contract (EventLog1 events).
// Mirrors the logic of the previous Dune query https://dune.com/queries/4959575/9826428:
//   margin fees      = positionFeeAmount * collateralTokenPrice + borrowingFeeUsd   (PositionFeesCollected)
//   liquidation fees = liquidationFeeAmount * collateralTokenPrice                  (PositionFeesCollected)
//   swap fees        = tokenPrice * (feeReceiverAmount + feeAmountForPool)          (SwapFeesCollected)
//   price impact     = distributionAmount of the index token                        (PositionImpactPoolDistributed)
// GMX prices are 30 - tokenDecimals precision, so amount * price is always a 30-decimal USD value.

import { ethers } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const config: Record<string, { eventEmitter: string; dataStore: string; start: string }> = {
  [CHAIN.ARBITRUM]: {
    eventEmitter: '0xC8ee91A54287DB53897056e12D9819156D3822Fb',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
    start: '2023-08-01',
  },
  [CHAIN.AVAX]: {
    eventEmitter: '0xDb17B211c34240B014ab6d61d4A31FA0C0e20c26',
    dataStore: '0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6',
    start: '2023-08-24',
  },
  [CHAIN.MEGAETH]: {
    eventEmitter: '0xAf2E131d483cedE068e21a9228aD91E623a989C2',
    dataStore: '0xE43C7B694f6b652a9F4A0f275C008d18758Dce35',
    start: '2026-04-08',
  },
}

const EVENT_LOG_1_TOPIC = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160'
const EVENT_LOG_1_ABI = 'event EventLog1(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, tuple(tuple(tuple(string key, address value)[] items, tuple(string key, address[] value)[] arrayItems) addressItems, tuple(tuple(string key, uint256 value)[] items, tuple(string key, uint256[] value)[] arrayItems) uintItems, tuple(tuple(string key, int256 value)[] items, tuple(string key, int256[] value)[] arrayItems) intItems, tuple(tuple(string key, bool value)[] items, tuple(string key, bool[] value)[] arrayItems) boolItems, tuple(tuple(string key, bytes32 value)[] items, tuple(string key, bytes32[] value)[] arrayItems) bytes32Items, tuple(tuple(string key, bytes value)[] items, tuple(string key, bytes[] value)[] arrayItems) bytesItems, tuple(tuple(string key, string value)[] items, tuple(string key, string[] value)[] arrayItems) stringItems) eventData)'

const eventNameTopic = (name: string) => ethers.keccak256(ethers.toUtf8Bytes(name))
const POSITION_FEES_COLLECTED = eventNameTopic('PositionFeesCollected')
const SWAP_FEES_COLLECTED = eventNameTopic('SwapFeesCollected')
const POSITION_IMPACT_POOL_DISTRIBUTED = eventNameTopic('PositionImpactPoolDistributed')

// DataStore key for a market's index token: keccak256(abi.encode(market, keccak256(abi.encode("INDEX_TOKEN"))))
const abi = ethers.AbiCoder.defaultAbiCoder()
const INDEX_TOKEN_KEY = ethers.keccak256(abi.encode(['string'], ['INDEX_TOKEN']))
const indexTokenKey = (market: string) => ethers.keccak256(abi.encode(['address', 'bytes32'], [market, INDEX_TOKEN_KEY]))

const PRICE_IMPACT = 'Price Impact'
const REFERRAL_REBATES = 'Referral Rebates'

// Revenue is the fee receiver's share read from each event (feeReceiverAmount): 37% of fees, with position fees
// counted after referral rebates (50% on MegaETH, see positionFeeReceiverFactor). GMX splits it into 10% of fees for the treasury and 27% for GMX token holders:
// https://docs.gmx.io/docs/tokenomics/gmx-token and https://docs.gmx.io/docs/providing-liquidity (63% LPs / 37% protocol)
// The 27% is holders revenue when the fees are earned (https://docs.gmx.io/docs/tokenomics/rewards):
// - until 2026-03-04 it was distributed to GMX stakers, as ETH and AVAX until 2024-10-30 and then as GMX bought with it (FeeHandler BUYBACK_GMX_FACTOR 0.7297)
// - Snapshot 0xfe665ac5665dd9238049be01de34ee047f8a1513e6b0e0fa25945248589d97f4 (2026-02-24) moved the rewards to the treasury until GMX trades above $90.
//   BUYBACK_GMX_FACTOR is 0 since block 440628485 (2026-03-11, tx 0xb8e4d42d487e8d61ceff3e7b3f145199b8ed71a3ebb0c3a32743ec4cd37911a6) and the fee receiver paid 27/37 of its WETH
//   to Safe 0x729d09932cc56934dbe4e3cb2ab8bbf657de1609, which buys GMX on a CEX and holds it in Safe 0x6e65fddfe4cecb227f22be98f05c031a21255f93 (treasuryGmxBalance of https://arbitrum.gmxapi.io/v1/staking/power)
// - Avalanche fees take the same route through Arbitrum, e.g. the 2026-10-24 payout of the USDC bridged on 2026-09-24
// - not traced: FEE_RECEIVER moved to Safe 0x028220b51343e065d3884780f9a5bd853278365e on 2026-10-29 (Arbitrum block 519269299) with no payout seen by 2026-11-07, and MegaETH fees have never been claimed
// A later release of the held GMX to stakers distributes these buybacks and must not be counted again
const PROTOCOL_OF_REVENUE = 10 / 37
const HOLDERS_OF_REVENUE = 27 / 37

type KeyValue = { key?: string; value?: any; 0?: string; 1?: any }
const toRecord = (items: KeyValue[]): Record<string, any> =>
  Object.fromEntries(items.map((item) => [item.key ?? item[0], item.value ?? item[1]]))
const uint = (record: Record<string, any>, key: string): bigint => {
  const item = record[key]
  return item == null ? 0n : BigInt(item.toString())
}
const usd30ToNumber = (amount: bigint): number => Number(amount / 10n ** 12n) / 1e18

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { eventEmitter, dataStore } = config[options.chain]
  const getLogs = (nameTopic: string) => options.getLogs({
    targets: [eventEmitter],
    topics: [EVENT_LOG_1_TOPIC, nameTopic],
    eventAbi: EVENT_LOG_1_ABI,
  })

  const [positionLogs, swapLogs, impactLogs] = await Promise.all([
    getLogs(POSITION_FEES_COLLECTED),
    getLogs(SWAP_FEES_COLLECTED),
    getLogs(POSITION_IMPACT_POOL_DISTRIBUTED),
  ])

  let marginFees = 0n
  let liquidationFees = 0n
  let swapFees = 0n
  let marginRevenue = 0n
  let liquidationRevenue = 0n
  let swapRevenue = 0n
  let referralRebates = 0n

  for (const log of positionLogs) {
    const uints = toRecord((log.eventData ?? log[4]).uintItems.items)
    const price = (uint(uints, 'collateralTokenPrice.min') + uint(uints, 'collateralTokenPrice.max')) / 2n
    marginFees += uint(uints, 'positionFeeAmount') * price + uint(uints, 'borrowingFeeUsd')
    liquidationFees += uint(uints, 'liquidationFeeAmount') * price
    // feeReceiverAmount is the receiver's share of the position fee after rebates, the borrowing fee and the liquidation fee
    const liquidationToReceiver = uint(uints, 'liquidationFeeAmountForFeeReceiver')
    marginRevenue += (uint(uints, 'feeReceiverAmount') - liquidationToReceiver) * price
    liquidationRevenue += liquidationToReceiver * price
    // trader discount (referral or larger pro tier) + affiliate reward, taken out of the position fee first
    referralRebates += (uint(uints, 'positionFeeAmount') - uint(uints, 'protocolFeeAmount')) * price
  }

  for (const log of swapLogs) {
    const uints = toRecord((log.eventData ?? log[4]).uintItems.items)
    swapFees += uint(uints, 'tokenPrice') * (uint(uints, 'feeReceiverAmount') + uint(uints, 'feeAmountForPool'))
    swapRevenue += uint(uints, 'tokenPrice') * uint(uints, 'feeReceiverAmount')
  }

  // positive price impact distributed from the impact pool to LPs, denominated in the market's index token
  const impactByMarket: Record<string, bigint> = {}
  for (const log of impactLogs) {
    const eventData = log.eventData ?? log[4]
    const market = toRecord(eventData.addressItems.items).market
    const amount = uint(toRecord(eventData.uintItems.items), 'distributionAmount')
    if (amount > 0n) impactByMarket[market] = (impactByMarket[market] ?? 0n) + amount
  }
  const markets = Object.keys(impactByMarket)
  const indexTokens: string[] = markets.length ? await options.api.multiCall({
    target: dataStore,
    abi: 'function getAddress(bytes32 key) view returns (address)',
    calls: markets.map(indexTokenKey),
  }) : []

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // LPs get each fee minus the fee receiver's share and minus referral rebates, so Fees = Revenue + SupplySideRevenue
  const addUsd = (amount: number, revenue: number, metric: string, rebates = 0) => {
    dailyFees.addUSDValue(amount, metric)
    dailyRevenue.addUSDValue(revenue, metric)
    dailyProtocolRevenue.addUSDValue(revenue * PROTOCOL_OF_REVENUE, metric)
    dailyHoldersRevenue.addUSDValue(revenue * HOLDERS_OF_REVENUE, metric)
    dailySupplySideRevenue.addUSDValue(amount - revenue - rebates, metric)
    if (rebates) dailySupplySideRevenue.addUSDValue(rebates, REFERRAL_REBATES)
  }
  addUsd(usd30ToNumber(marginFees), usd30ToNumber(marginRevenue), METRIC.MARGIN_FEES, usd30ToNumber(referralRebates))
  addUsd(usd30ToNumber(liquidationFees), usd30ToNumber(liquidationRevenue), METRIC.LIQUIDATION_FEES)
  addUsd(usd30ToNumber(swapFees), usd30ToNumber(swapRevenue), METRIC.SWAP_FEES)

  // distributePositionImpactPool only shrinks the impact pool, which raises the GM pool value: all of it goes to LPs
  markets.forEach((market, i) => {
    const token = indexTokens[i]
    const amount = impactByMarket[market]
    dailyFees.add(token, amount, PRICE_IMPACT)
    dailySupplySideRevenue.add(token, amount, PRICE_IMPACT)
  })

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Fees from opening/closing perpetual positions, borrowing fees, swap fees, liquidation fees, and positive price impact distributed from the impact pool, decoded from EventEmitter logs",
  UserFees: "Fees from opening/closing perpetual positions, swap fees, and liquidation fees paid by traders",
  Revenue: "37% of position fees (after referral rebates; 50% on MegaETH) and of borrowing, liquidation and swap fees, split between protocol treasury (10%) and GMX token holders (27%); distributed price impact goes to liquidity providers instead",
  ProtocolRevenue: "10% of position fees (after referral rebates) and of borrowing, liquidation and swap fees goes to the protocol treasury",
  HoldersRevenue: "27% of position fees (after referral rebates) and of borrowing, liquidation and swap fees went to GMX stakers until 4 March 2026; since then it buys GMX on the open market, held in the GMX treasury until GMX trades above $90",
  SupplySideRevenue: "63% of position fees (after referral rebates) and of borrowing, liquidation and swap fees, plus all distributed price impact, goes to GM token liquidity providers; referral discounts and affiliate rewards go to traders and affiliates",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MARGIN_FEES]: "Fees from opening/closing perpetual positions and borrowing fees charged to maintain leveraged positions",
    [METRIC.SWAP_FEES]: "Fees charged when swapping tokens through GMX v2 markets",
    [METRIC.LIQUIDATION_FEES]: "Fees collected when positions are liquidated due to insufficient collateral",
    [PRICE_IMPACT]: "Positive price impact distributed from the position impact pool to the market pool, in index token",
  },
  Revenue: {
    [METRIC.MARGIN_FEES]: "37% of margin fees (after referral rebates) and borrowing fees retained by protocol",
    [METRIC.SWAP_FEES]: "37% of swap fees retained by protocol",
    [METRIC.LIQUIDATION_FEES]: "37% of liquidation fees retained by protocol",
  },
  ProtocolRevenue: {
    [METRIC.MARGIN_FEES]: "10% of margin fees (after referral rebates) and borrowing fees to protocol treasury",
    [METRIC.SWAP_FEES]: "10% of swap fees to protocol treasury",
    [METRIC.LIQUIDATION_FEES]: "10% of liquidation fees to protocol treasury",
  },
  HoldersRevenue: {
    [METRIC.MARGIN_FEES]: "27% of margin fees (after referral rebates) and borrowing fees went to GMX stakers until 4 March 2026; since then it buys GMX held in the GMX treasury",
    [METRIC.SWAP_FEES]: "27% of swap fees went to GMX stakers until 4 March 2026; since then it buys GMX held in the GMX treasury",
    [METRIC.LIQUIDATION_FEES]: "27% of liquidation fees went to GMX stakers until 4 March 2026; since then it buys GMX held in the GMX treasury",
  },
  SupplySideRevenue: {
    [METRIC.MARGIN_FEES]: "63% of margin fees (after referral rebates) and borrowing fees distributed to GM token liquidity providers",
    [REFERRAL_REBATES]: "Referral discounts to traders and rewards to affiliates, paid out of position fees before the protocol's 37% (positionFeeAmount - protocolFeeAmount)",
    [METRIC.SWAP_FEES]: "63% of swap fees distributed to GM token liquidity providers",
    [METRIC.LIQUIDATION_FEES]: "63% of liquidation fees distributed to GM token liquidity providers",
    [PRICE_IMPACT]: "All distributed price impact to GM token liquidity providers",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { start }])),
  methodology,
  breakdownMethodology,
}

export default adapter
