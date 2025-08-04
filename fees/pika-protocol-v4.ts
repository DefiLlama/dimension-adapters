import * as sdk from "@defillama/sdk";
import { Chain } from "../adapters/types";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees, FetchResultVolume } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";

interface IVault {
  txCount: number;
}

interface ITransaction {
  id: number;
  timestamp: number;
  tradeFee: number;
  count: number;
}
interface ILiquidation {
  timestamp: number;
  remainingReward: number;
}

type IURL = {
  [l: string | Chain]: string;
}

interface IFees {
  vaults: IVault[];
}
interface ITransactions {
  transactions: ITransaction[]
}
interface ILiquidations {
  liquidations: ILiquidation[]
}

const endpoints: IURL = {
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('5dP9FpbXxmNPRaERfzyKEGuRKh2NRQuwPBWfMLGoSRX5')
}

const fetch = (chain: Chain) => {
  return async (): Promise<FetchResultFees> => {
    let todayLiquidationFee = 0;
    let todayTradeFee = 0;
    const timestamp = Math.floor(Date.now() / 1000 - 86400);
    const graphQuery1 = gql
      `
      {
        vaults(first: 1)
        {
          txCount
        }
      }
    `;
    const res1: IFees = (await request(endpoints[chain], graphQuery1));
    const totalCount = res1.vaults[0].txCount
    let skip = totalCount;
    while(skip > totalCount - 3000) {
      const graphQuery2 = gql
        `
        {
          transactions(first:1000, where: {count_lt: ${skip}}, orderBy: count, orderDirection: desc)
          {
            id
            singleAmount
            timestamp
            tradeFee
            count
          }
        }
      `;
      const res2: ITransactions = (await request(endpoints[chain], graphQuery2));

      if (res2 !== undefined) {
        let transactions = res2.transactions;
        transactions.map((item: ITransaction) => {
          if (item.timestamp > timestamp) {
            todayTradeFee += item.tradeFee / 100000000
          }
        });
        skip = transactions[transactions.length - 1].count * 1
      }
    }
    const graphQuery3 = gql
      `
      {
        liquidations(where: {
          timestamp_gt: ${timestamp}
        })
        {
          id
          remainingReward
          timestamp
        }
      }
    `;
    const res3: ILiquidations = (await request(endpoints[chain], graphQuery3));
    let liquidations = res3.liquidations;
    liquidations.map((item: ILiquidation) => {
      if (item.timestamp > timestamp) {
        todayLiquidationFee += item.remainingReward / 100000000;
      }
    });

    const dailyFees = todayTradeFee + todayLiquidationFee;
    const dailySupplySideRevenue = dailyFees * 0.5;
    const dailyProtocolRevenue = dailyFees * 0.3;
    return {
      timestamp,
      dailyFees,
      dailyRevenue: dailyProtocolRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      dailyProtocolRevenue: dailyProtocolRevenue,
    };
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-06-28',
    },
  },
};

export default adapter;
