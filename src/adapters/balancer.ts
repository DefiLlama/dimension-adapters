import { FeeAdapter } from "../utils/adapters.type";
import { ARBITRUM, ETHEREUM, POLYGON } from "../helpers/chains";
import { getStartTimestamp } from "../helpers/getStartTimestamp";
import { request, gql } from "graphql-request";
import { IGraphUrls } from "../helpers/graphs.type";
import { Chain } from "../utils/constants";
import { getBlock } from "../helpers/getBlock";
import { ChainBlocks } from "@defillama/adapters/volumes/dexVolume.type";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../utils/date";

const v1Endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer",
}

const v2Endpoints = {
  [ETHEREUM]:
    "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-v2",
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-arbitrum-v2",
  [POLYGON]:
    "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer-polygon-v2",
};

const v1Graphs = (graphUrls: IGraphUrls) => {
  return (chain: Chain) => {
    return async (timestamp: number, chainBlocks: ChainBlocks) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

      const todaysBlock = (await getBlock(todaysTimestamp, chain, chainBlocks));
      const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

      const graphQuery = gql
      `{
        today: balancer(id: "1", block: { number: ${todaysBlock} }) {
          totalSwapFee
        }
        yesterday: balancer(id: "1", block: { number: ${yesterdaysBlock} }) {
          totalSwapFee
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);
      const dailyFee = (new BigNumber(graphRes["today"]["totalSwapFee"]).minus(new BigNumber(graphRes["yesterday"]["totalSwapFee"])))

      return {
        timestamp,
        totalFees: graphRes["today"]["totalSwapFee"],
        dailyFees: dailyFee.toString(),
        totalRevenue: "0", // balancer v1 had no rev
        dailyRevenue: "0", // balancer v1 had no rev
      };
    };
  };
};

const v2Graphs = (graphUrls: IGraphUrls) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const startTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const dayId = Math.floor(startTimestamp / 86400)

      const graphQuery = gql
      `query fees($dayId: String!, $yesterdayId: String!) {
        today: balancerSnapshot(id: $dayId) {
          totalSwapFee
        }
        yesterday: balancerSnapshot(id: $yesterdayId) {
          totalSwapFee
        }
        tenPcFeeChange: balancerSnapshot(id: "2-18972") {
          totalSwapFee
          timestamp
        }
        fiftyPcFeeChange: balancerSnapshot(id: "2-19039") {
          totalSwapFee
          timestamp
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery, {
        dayId: `2-${dayId}`,
        yesterdayId: `2-${dayId - 1}`
      });
      const currentTotalSwapFees = new BigNumber(graphRes["today"]["totalSwapFee"])

      const dailyFee = currentTotalSwapFees.minus(new BigNumber(graphRes["yesterday"]["totalSwapFee"]))
      const tenPcFeeTimestamp = graphRes["tenPcFeeChange"]["timestamp"]
      const fiftyPcFeeTimestamp = graphRes["fiftyPcFeeChange"]["timestamp"]
      const tenPcTotalSwapFees = new BigNumber(graphRes["tenPcFeeChange"]["totalSwapFee"])
      const fiftyPcTotalSwapFees = new BigNumber(graphRes["fiftyPcFeeChange"]["totalSwapFee"])

      // 10% gov vote enabled: https://vote.balancer.fi/#/proposal/0xf6238d70f45f4dacfc39dd6c2d15d2505339b487bbfe014457eba1d7e4d603e3
      // 50% gov vote change: https://vote.balancer.fi/#/proposal/0x03e64d35e21467841bab4847437d4064a8e4f42192ce6598d2d66770e5c51ace
      const dailyRevenue = startTimestamp < tenPcFeeTimestamp ? "0" : (
        startTimestamp < fiftyPcFeeTimestamp ? dailyFee.multipliedBy(0.1) : dailyFee.multipliedBy(0.5))
      const totalRevenue = startTimestamp < tenPcFeeTimestamp ? "0" : (
        startTimestamp < fiftyPcFeeTimestamp ? currentTotalSwapFees.minus(tenPcTotalSwapFees).multipliedBy(0.1) : currentTotalSwapFees.minus(fiftyPcTotalSwapFees).multipliedBy(0.5))
      
      return {
        timestamp,
        totalFees: graphRes["today"]["totalSwapFee"],
        dailyFees: dailyFee.toString(),
        totalRevenue: totalRevenue.toString(), // balancer v2 subgraph does not flash loan fees yet
        dailyRevenue: dailyRevenue.toString(), // balancer v2 subgraph does not flash loan fees yet
      };
    };
  };
};

const adapter: FeeAdapter = {
  breakdown: {
    v1: {
      [ETHEREUM]: {
        fetch: v1Graphs(v1Endpoints)(ETHEREUM),
        start: getStartTimestamp({
          endpoints: v1Endpoints,
          chain: ETHEREUM,
          dailyDataField: "transactions",
          dateField: "timestamp"
        }),
      },
    },
    v2: {
      [ETHEREUM]: {
        fetch: v2Graphs(v2Endpoints)(ETHEREUM),
        start: getStartTimestamp({
          endpoints: v2Endpoints,
          chain: ETHEREUM,
          dailyDataField: "balancerSnapshots",
          dateField: "timestamp"
        }),
      },
      [POLYGON]: {
        fetch: v2Graphs(v2Endpoints)(POLYGON),
        start: getStartTimestamp({
          endpoints: v2Endpoints,
          chain: POLYGON,
          dailyDataField: "balancerSnapshots",
          dateField: "timestamp"
        }),
      },
      [ARBITRUM]: {
        fetch: v2Graphs(v2Endpoints)(ARBITRUM),
        start: getStartTimestamp({
          endpoints: v2Endpoints,
          chain: ARBITRUM,
          dailyDataField: "balancerSnapshots",
          dateField: "timestamp"
        }),
      }
    }
  }
}

export default adapter;
