import { Adapter, ChainEndpoints, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
const { request, gql } = require("graphql-request");

const endpoints = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/orby/orby",
};

const graphs = (graphUrls: ChainEndpoints) => {
  const fetch: FetchV2 = async ({
    chain,
    createBalances,
    endTimestamp,
    getStartBlock,
    getEndBlock,
  }) => {
    const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(endTimestamp);
    const dailyFees = createBalances();

    const graphQuery = gql`
      query fees($startOfDayBlock: Int!, $endOfDayBlock: Int!) {
        yesterday: global(id: "only", block: { number: $startOfDayBlock }) {
          totalBorrowingFeesPaid
          totalRedemptionFeesPaid
        }
        today: global(id: "only", block: { number: $endOfDayBlock }) {
          totalBorrowingFeesPaid
          totalRedemptionFeesPaid
        }
      }
    `;
    const [startBlock, endBlock] = await Promise.all([
      getStartBlock(),
      getEndBlock(),
    ]);

    const graphRes = await request(graphUrls[chain], graphQuery, {
      startOfDayBlock: startBlock,
      endOfDayBlock: endBlock - 2,
    });

    const borrowingFees =
      Number(graphRes.today.totalBorrowingFeesPaid) -
      Number(graphRes.yesterday.totalBorrowingFeesPaid);
    const redemptionFeesETH =
      Number(graphRes.today.totalRedemptionFeesPaid) -
      Number(graphRes.yesterday.totalRedemptionFeesPaid);

    dailyFees.addCGToken("tether", borrowingFees);
    dailyFees.addGasToken(redemptionFeesETH * 10 ** 18);

    return {
      timestamp: dayTimestamp,
      dailyFees: dailyFees,
      dailyRevenue: dailyFees,
      dailyHoldersRevenue: dailyFees,
    };
  };
  return fetch;
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: graphs(endpoints),
      start: 1706837536,
    },
  },
};

export default adapter;
