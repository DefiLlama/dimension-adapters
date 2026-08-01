import { gql, GraphQLClient } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const graphQLClient = new GraphQLClient("https://graph.xexchange.com/graphql");

const query = gql`{
  factory {
    totalVolumeUSD24h
    totalFeesUSD24h
  }
}`;

const fetch = async (options: FetchOptions) => {
  const { factory } = await graphQLClient.request(query);
  if (!factory) throw new Error("xExchange: failed to fetch factory data");
  
  const dailyVolume = `${factory.totalVolumeUSD24h}`;
  const totalFees = Number(factory.totalFeesUSD24h);

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addUSDValue(totalFees, METRIC.SWAP_FEES);
  dailyUserFees.addUSDValue(totalFees, METRIC.SWAP_FEES);

  dailySupplySideRevenue.addUSDValue(totalFees * (0.2 / 0.3), METRIC.LP_FEES);

  dailyHoldersRevenue.addUSDValue(totalFees * (0.05 / 0.3), 'Energy Holders Rewards');
  dailyHoldersRevenue.addUSDValue(totalFees * (0.05 / 0.3), METRIC.TOKEN_BUY_BACK);

  dailyRevenue.addUSDValue(totalFees * (0.05 / 0.3), 'Energy Holder Fees');
  dailyRevenue.addUSDValue(totalFees * (0.05 / 0.3), METRIC.TOKEN_BUY_BACK);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "A 0.3% fee is charged on each swap.",
  UserFees: "Users pay a 0.3% fee on each swap.",
  Revenue: "0.1% of each swap is not distributed to LPs (0.05% used for MEX buyback & burn, 0.05% distributed to Energy holders).",
  HoldersRevenue: "0.05% of each swap is distributed to all accounts holding Energy (xMEX lockers) and 0.05% used for MEX buyback & burn.",
  SupplySideRevenue: "0.2% of each swap is distributed to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.3% fee charged on every token swap on xExchange.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "0.3% swap fee paid by traders.",
  },
  Revenue: {
    'Energy Holder Fees': "0.05% of swap fees distributed to Energy holders (xMEX lockers).",
    [METRIC.TOKEN_BUY_BACK]: "0.05% of swap fees used to buy back and burn MEX from the EGLD/MEX pool.",
  },
  HoldersRevenue: {
    'Energy Holder Fees': "0.05% of swap fees distributed to Energy holders (xMEX lockers).",
    [METRIC.TOKEN_BUY_BACK]: "0.05% of swap fees used to buy back and burn MEX from the EGLD/MEX pool.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "0.2% of swap fees distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ELROND]: {
      fetch,
      start: '2022-10-05',
      runAtCurrTime: true,
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
