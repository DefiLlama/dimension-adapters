import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('F7qb71hWab6SuRL5sf6LQLTpNahmqMsBnnweYHzLGUyG'),
}

const PROTOCOL_FEE_RATIO = 0.1 // 10%
const LIDO_MEV_REWARDS_VAULT = '0x388c818ca8b9251b393131c08a736a67ccb19297';

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400)

  const graphQuery = gql
    `{
    financialsDailySnapshot(id: ${dateId}) {
        dailyTotalRevenueUSD
        dailyProtocolSideRevenueUSD
        cumulativeTotalRevenueUSD
        cumulativeProtocolSideRevenueUSD
        dailySupplySideRevenueUSD
        cumulativeSupplySideRevenueUSD
    }
  }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyTotalRevenueUSD = Number(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD)
  const dailySupplySideRevenueUSD = Number(graphRes.financialsDailySnapshot.dailySupplySideRevenueUSD)
  const dailyProtocolRevenueUSD = dailyTotalRevenueUSD * PROTOCOL_FEE_RATIO

  // MEV and execution rewards
  const mevFeesETH = options.createBalances()
  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: 'to',
    addresses: [LIDO_MEV_REWARDS_VAULT],
    from_block: Number(options.fromApi.block),
    to_block: Number(options.toApi.block),
  })
  for (const tx of transactions) {
    mevFeesETH.addGasToken(tx.value)
  }

  const totalMevFees = await mevFeesETH.getUSDValue()
  const protocolMevFees = totalMevFees * PROTOCOL_FEE_RATIO
  const supplySideMevFees = totalMevFees - protocolMevFees
  
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  
  dailyFees.addUSDValue(dailyTotalRevenueUSD - totalMevFees, METRIC.STAKING_REWARDS)
  dailySupplySideRevenue.addUSDValue(dailySupplySideRevenueUSD - supplySideMevFees, METRIC.STAKING_REWARDS)
  dailyRevenue.addUSDValue(dailyProtocolRevenueUSD - protocolMevFees, METRIC.STAKING_REWARDS)
  
  dailyFees.addUSDValue(totalMevFees, METRIC.MEV_REWARDS)
  dailySupplySideRevenue.addUSDValue(supplySideMevFees, METRIC.MEV_REWARDS)
  dailyRevenue.addUSDValue(protocolMevFees, METRIC.MEV_REWARDS)
  
  return {
    dailyFees,
    dailyUserFees: 0,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2020-12-19',
    },
  },
  methodology: {
    Fees: "Staking rewards earned by all staked ETH",
    UserFees: "Lido takes no fees from users.",
    Revenue: "Lido applies a 10% fee on staking rewards that are split between node operators and the DAO Treasury",
    HoldersRevenue: "No revenue distributed to LDO holders",
    ProtocolRevenue: "Lido applies a 10% fee on staking rewards that are split between node operators and the DAO Treasury",
    SupplySideRevenue: "Staking rewards earned by stETH holders"
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators.',
      [METRIC.MEV_REWARDS]: 'ETH rewards from MEV tips on ETH execution layer paid by block builders.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Lido.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Lido.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Lido.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Lido.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to stakers.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to stakers.',
    },
  }
}

export default adapter;
