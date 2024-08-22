import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import { BaseAdapter, BreakdownAdapter, ChainEndpoints, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: ChainEndpoints = {
  [CHAIN.SEI]: "https://graph.mainnet.jellyverse.org/subgraphs/name/jelly/verse"
};

interface IPool {
  id: string;
  swapVolume: string;
  swapFees: string;
}

interface IPoolSnapshot {
  today: IPool[];
  yesterday: IPool[];
}

const v2Graphs = (chain: Chain) => {
  return async ({ endTimestamp }): Promise<FetchResultV2> => {
    const startTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const fromTimestamp = startTimestamp - 60 * 60 * 24
    const toTimestamp = startTimestamp

    const graphQuery = gql`
      query volumes {
        today: poolSnapshots(where: {timestamp: ${toTimestamp}}, orderBy: swapVolume, orderDirection: desc) {
          id
          swapVolume
          swapFees
        }
        yesterday: poolSnapshots(where: {timestamp: ${fromTimestamp}}, orderBy: swapVolume, orderDirection: desc) {
          id
          swapVolume
          swapFees
        }
      }
    `;

    const graphRes: IPoolSnapshot = await request(endpoints[chain], graphQuery);

    const { dailyVolume, dailyFees } = graphRes.today.reduce((acc, p: IPool) => {
      const yesterdayPool = graphRes.yesterday.find((e: IPool) => e.id.split('-')[0] === p.id.split('-')[0]);
      const yesterdayVolume = Number(yesterdayPool?.swapVolume || '0');
      const yesterdayFees = Number(yesterdayPool?.swapFees || '0');

      const volumeDiff = Number(p.swapVolume) - yesterdayVolume;
      const feesDiff = Number(p.swapFees) - yesterdayFees;

      acc.dailyVolume += volumeDiff;
      acc.dailyFees += feesDiff;

      return acc;
    }, { dailyVolume: 0, dailyFees: 0 });

    return {
      dailyVolume: dailyVolume.toString(),
      dailyFees: dailyFees.toString(),
    };
  };
};

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.SEI]: {
        fetch: v2Graphs(CHAIN.SEI),
        start: getStartTimestamp({
          endpoints,
          chain: CHAIN.SEI,
          dailyDataField: `balancerSnapshots`,
          dateField: 'timestamp',
          volumeField: 'totalSwapVolume'
        }),
      }
    }
  }
};

export default adapter;
