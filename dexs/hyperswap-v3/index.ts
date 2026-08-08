import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const GRAPH_URL = 'https://api.subgraph.ormilabs.com/api/public/33c67399-d625-4929-b239-5709cd66e422/subgraphs/hyperswap-v3/v0.1.2/gn'

const SLOT0_ABI = "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"

// Of the protocol's cut, 75% buys back and burns SWAP and 25% goes to the treasury.
const BUYBACK_SHARE = 0.75
const TREASURY_SHARE = 0.25

// slot0.feeProtocol packs one 4-bit fee denominator per token (0 = no protocol fee).
// Pools are deployed with it at 0 and switched on later, one pool at a time, so it has
// to be read per pool at the block being priced rather than assumed. Today every active
// pool reads 102 (0x66) = 1/6 on both tokens.
//
// Each swap pays the protocol fee on its input token only, so the two denominators are
// averaged: a pool with one side unset charges the fee on roughly half its flow, and a
// symmetric pool reduces to that single share. Averaging assumes balanced two-way flow,
// which is the best available approximation since the subgraph reports one combined fee
// figure per pool rather than a per-token split.
const protocolFeeShare = (feeProtocol: number): number => {
  const token0Denominator = feeProtocol & 0x0f
  const token1Denominator = (feeProtocol >> 4) & 0x0f
  const token0Share = token0Denominator > 0 ? 1 / token0Denominator : 0
  const token1Share = token1Denominator > 0 ? 1 / token1Denominator : 0
  return (token0Share + token1Share) / 2
}

const getPoolDayDatas = async (startOfDay: number) => {
  const poolDayDatas: any[] = []
  let cursor = ''

  while (true) {
    const query = gql`
      query q{
        poolDayDatas(where: {date: ${startOfDay}, id_gt: "${cursor}"}, first: 1000, orderBy: id, orderDirection: asc) {
          id
          volumeUSD
          feesUSD
          pool {
            id
          }
        }
      }
    `
    const data = await request(GRAPH_URL, query)
    poolDayDatas.push(...data.poolDayDatas)
    if (data.poolDayDatas.length < 1000) break
    cursor = data.poolDayDatas[data.poolDayDatas.length - 1].id
  }

  return poolDayDatas
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const poolDayDatas = await getPoolDayDatas(options.startOfDay)

  const slot0s = await options.toApi.multiCall({
    abi: SLOT0_ABI,
    calls: poolDayDatas.map((e: any) => e.pool.id),
  })

  poolDayDatas.forEach((e: any, i: number) => {
    const fees = Number(e.feesUSD)
    const protocolFees = fees * protocolFeeShare(Number(slot0s[i].feeProtocol))

    dailyVolume.addUSDValue(Number(e.volumeUSD))
    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES)
    dailyRevenue.addUSDValue(protocolFees * TREASURY_SHARE, 'Token Swap Fees To Protocol')
    dailyRevenue.addUSDValue(protocolFees * BUYBACK_SHARE, 'Token Swap Fees To Buy Back And Burn SWAP')
    dailyProtocolRevenue.addUSDValue(protocolFees * TREASURY_SHARE, 'Token Swap Fees To Protocol')
    dailySupplySideRevenue.addUSDValue(fees - protocolFees, 'Token Swap Fees To LPs')
    dailyHoldersRevenue.addUSDValue(protocolFees * BUYBACK_SHARE, METRIC.TOKEN_BUY_BACK)
  })

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

const methodology = {
  Volume: "Total value of tokens swapped across all HyperSwap V3 pools.",
  Fees: "Total swap fees paid by traders across all HyperSwap V3 pools.",
  UserFees: "Total swap fees paid by traders across all HyperSwap V3 pools.",
  Revenue: "Each pool sets how much of its swap fee the protocol keeps, and HyperSwap switches that on one pool at a time, so the share is read from each pool individually for the day being measured. Pools trade with it switched off until HyperSwap enables it, and those give their entire swap fee to liquidity providers. Every pool that has it enabled currently keeps one sixth. Of whatever the protocol keeps, 25% goes to the treasury and 75% buys back and burns SWAP.",
  ProtocolRevenue: "The treasury's quarter of the protocol's share of swap fees.",
  SupplySideRevenue: "The part of every swap fee that liquidity providers keep: the entire fee on pools where the protocol fee is still switched off, and whatever is left after the protocol's share on pools where it is on — currently five sixths.",
  HoldersRevenue: "The three quarters of the protocol's share of swap fees that is used to buy back and burn SWAP.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Total swap fees paid by traders across all HyperSwap V3 pools.",
  },
  Revenue: {
    'Token Swap Fees To Protocol': "The treasury's 25% of whatever swap fees the protocol keeps.",
    'Token Swap Fees To Buy Back And Burn SWAP': "The 75% of the swap fees the protocol keeps that is used to buy back and burn SWAP.",
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': "Swap fees paid to liquidity providers — the entire fee on pools where the protocol fee is switched off, and whatever is left after the protocol's share where it is on (currently five sixths).",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "SWAP bought back and burned using 75% of the swap fees the protocol keeps.",
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-18',
  methodology,
  breakdownMethodology,
}

export default adapter
