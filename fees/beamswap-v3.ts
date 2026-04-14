import * as sdk from "@defillama/sdk";
import { Chain, FetchOptions } from "../adapters/types";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { METRIC } from "../helpers/metrics";

interface IPoolData {
  id: number;
  feesUSD: string;
} 

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('2YnTZfQmenjvJ3bihewLGgAKnyqjrMWrStux8ZFE7ee6'),
}

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
  const graphQuery = gql
    `
    {
      uniswapDayData(id: ${dateId}) {
        id
        feesUSD
      }
    }
  `;

  const graphRes: IPoolData = (await request(endpoints[options.chain], graphQuery)).uniswapDayData;

  const dailyFeeUSD = graphRes;
  const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
  if (dailyFee === undefined) return { timestamp }

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(dailyFee, METRIC.SWAP_FEES);
  const dailyUserFees = options.createBalances();
  dailyUserFees.addUSDValue(dailyFee, METRIC.SWAP_FEES);
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(dailyFee.multipliedBy(0.16), METRIC.PROTOCOL_FEES);
  dailyRevenue.addUSDValue(dailyFee.multipliedBy(0.02), 'Token holder distributions');
  const dailyProtocolRevenue = options.createBalances();

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue: dailyFees.clone(0.84),
  };
}

const methodology = {
  Fees: "Trading fees paid by users on each swap",
  UserFees: "Trading fees paid by users on each swap",
  Revenue: "Portion of trading fees allocated to protocol treasury and token holders",
  ProtocolRevenue: "16% of trading fees allocated to protocol treasury",
  HoldersRevenue: "2% of trading fees distributed to token holders",
  SupplySideRevenue: "84% of trading fees distributed to liquidity providers",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees paid by users on each swap, typically 0.3% of trade volume",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Trading fees paid by users on each swap, typically 0.3% of trade volume",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "16% of swap fees retained by the protocol treasury",
    "Token holder distributions": "2% of swap fees distributed to governance token holders",
  },
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MOONBEAM],
  start: '2023-05-18',
  methodology,
  breakdownMethodology,
};

export default adapter;
