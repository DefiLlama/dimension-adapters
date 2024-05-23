import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.LINEA]:
    "https://graph-query.linea.build/subgraphs/name/Chimp-Exchange/chimp-exchange-subgraph",
};

interface IPool {
  id: string;
  swapFees: string;
  protocolFee: string;
}

interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
  tenPcFeeChange: {
    totalSwapFee: string;
    timestamp: number;
  };
  fiftyPcFeeChange: {
    totalSwapFee: string;
    timestamp: number;
  };
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const startTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const fromTimestamp = startTimestamp - 60 * 60 * 24;
      const toTimestamp = startTimestamp;
      const graphQuery = gql`query fees {
        today:poolSnapshots(where: {timestamp:${toTimestamp}}, orderBy:swapFees, orderDirection: desc) {
          id
          swapFees
          protocolFee
        }
        yesterday:poolSnapshots(where: {timestamp:${fromTimestamp}}, orderBy:swapFees, orderDirection: desc) {
          id
          swapFees
          protocolFee
        }
      }`;
      const graphRes: IPoolSnapshot = await request(
        graphUrls[chain],
        graphQuery
      );
      const dailyFee = graphRes["today"]
        .map((e: IPool) => {
          const yesterdayValue = new BigNumber(
            graphRes["yesterday"].find(
              (p: IPool) => p.id.split("-")[0] === e.id.split("-")[0]
            )?.swapFees || 0
          );
          if (yesterdayValue.toNumber() === 0) return new BigNumber("0");
          return new BigNumber(e.swapFees).minus(yesterdayValue);
        })
        .filter((e) => new BigNumber(e).toNumber() < 10000)
        .reduce((a: BigNumber, b: BigNumber) => a.plus(b), new BigNumber("0"));

      const currentTotalSwapFees = graphRes["today"]
        .map((e: IPool) => new BigNumber(e.swapFees))
        .reduce((a: BigNumber, b: BigNumber) => a.plus(b), new BigNumber("0"));
      const dailyRevenue = "0";
      const totalRevenue = "0";

      const dailyProtocolFee = graphRes["today"]
        .map((e: IPool) => {
          const yesterdayValue = new BigNumber(
            graphRes["yesterday"].find(
              (p: IPool) => p.id.split("-")[0] === e.id.split("-")[0]
            )?.protocolFee || 0
          );
          if (yesterdayValue.toNumber() === 0) return new BigNumber("0");
          return new BigNumber(e.protocolFee).minus(yesterdayValue);
        })
        .filter((e) => new BigNumber(e).toNumber() < 10000)
        .reduce((a: BigNumber, b: BigNumber) => a.plus(b), new BigNumber("0"));

      return {
        timestamp,
        totalUserFees: currentTotalSwapFees.toString(),
        dailyUserFees: dailyFee.toString(),
        totalFees: currentTotalSwapFees.toString(),
        dailyFees: dailyFee.toString(),
        totalRevenue: dailyProtocolFee.toString(), // balancer v2 subgraph does not flash loan fees yet
        dailyRevenue: dailyProtocolFee.toString(), // balancer v2 subgraph does not flash loan fees yet
        totalProtocolRevenue: totalRevenue.toString(),
        dailyProtocolRevenue: dailyRevenue.toString(),
        totalSupplySideRevenue: currentTotalSwapFees
          .minus(totalRevenue.toString())
          .toString(),
        dailySupplySideRevenue: new BigNumber(dailyFee.toString())
          .minus(dailyRevenue.toString())
          .toString(),
      };
    };
  };
};

const methodology = {
  UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
  Fees: "All trading fees collected (doesn't include withdrawal and flash loan fees)",
  Revenue: "Protocol revenue from all fees collected",
  ProtocolRevenue: "Set to 10% of collected fees by a governance vote",
  SupplySideRevenue:
    "A small percentage of the trade paid by traders to pool LPs, set by the pool creator or dynamically optimized by Gauntlet",
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch: graphs(endpoints)(CHAIN.LINEA),
      start: 1699488000,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
