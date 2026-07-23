import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const GRAPH_URL = 'https://api.subgraph.ormilabs.com/api/public/33c67399-d625-4929-b239-5709cd66e422/subgraphs/hyperswap-v3/v0.1.2/gn'
// const SWAP_TOKEN = '0x03832767bdf9a8ef007449942125ad605acfadb8';
// const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";

// feeProtocol=6 on every pool (verified via slot0()): 1/6 of swap fees go to the protocol,
// split 75% buyback-and-burn / 25% treasury. Remaining 5/6 stays with LPs.
const PROTOCOL_FEE_SHARE = 1 / 6
const LP_SHARE = 1 - PROTOCOL_FEE_SHARE
const BUYBACK_SHARE = PROTOCOL_FEE_SHARE * 0.75
const TREASURY_SHARE = PROTOCOL_FEE_SHARE * 0.25

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const query = gql`
      query q{
        uniswapDayDatas(where: {date: ${options.startOfDay}}, first: 1000, orderBy: volumeUSD, orderDirection: desc) {
          volumeUSD
          feesUSD
        }
      }
    `

  const data = await request(GRAPH_URL, query)

  data.uniswapDayDatas.forEach((e: any) => {
    dailyVolume.addUSDValue(Number(e.volumeUSD))
    dailyFees.addUSDValue(Number(e.feesUSD), METRIC.SWAP_FEES)
    dailyRevenue.addUSDValue(Number(e.feesUSD) * TREASURY_SHARE, 'Token Swap Fees To Protocol')
    dailyRevenue.addUSDValue(Number(e.feesUSD) * BUYBACK_SHARE, 'Token Swap Fees To Buy Back And Burn SWAP')
    dailyProtocolRevenue.addUSDValue(Number(e.feesUSD) * TREASURY_SHARE, 'Token Swap Fees To Protocol')
    dailySupplySideRevenue.addUSDValue(Number(e.feesUSD) * LP_SHARE, 'Token Swap Fees To LPs')
    dailyHoldersRevenue.addUSDValue(Number(e.feesUSD) * BUYBACK_SHARE, METRIC.TOKEN_BUY_BACK)
  })

  // const dailyHoldersRevenue = options.createBalances();
  // // Track token burns
  // const burnLogs = await options.getLogs({
  //   target: SWAP_TOKEN,
  //   eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
  //   topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "", BURN_ADDRESS],
  // });

  // for (const log of burnLogs) {
  //   dailyRevenue.add(SWAP_TOKEN, log.value, 'Token Burns');
  //   dailyHoldersRevenue.add(SWAP_TOKEN, log.value, 'Token Burns');
  // }

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
  Fees: "Total swap fees paid by traders across all HyperSwap V3 pools.",
  Revenue: "The protocol keeps one sixth (about 16.7%) of every swap fee via the pool fee switch; the rest goes to liquidity providers. Of the protocol's share, 25% is kept by the treasury and 75% buys back and burns SWAP.",
  ProtocolRevenue: "The treasury's cut — a quarter of the protocol's one-sixth fee share, about 4.2% of all swap fees.",
  SupplySideRevenue: "Liquidity providers earn five sixths (about 83.3%) of every swap fee.",
  HoldersRevenue: "Three quarters of the protocol's one-sixth fee share, about 12.5% of all swap fees, used to buy back and burn SWAP.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Total swap fees paid by traders across all HyperSwap V3 pools.",
  },
  Revenue: {
    'Token Swap Fees To Protocol': "The treasury's 25% cut of the protocol's one-sixth fee share (about 4.2% of total fees).",
    'Token Swap Fees To Buy Back And Burn SWAP': "The 75% of the protocol's one-sixth fee share (about 12.5% of total fees) used to buy back and burn SWAP.",
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': "Five sixths (about 83.3%) of swap fees paid to liquidity providers.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "SWAP bought back and burned using 75% of the protocol's one-sixth fee share.",
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
