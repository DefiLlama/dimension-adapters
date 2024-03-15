import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IData {
  totalTradingVolume: string;
}

interface IProtocolData {
  protocolByDay: IData;
  protocol: IData;
}

type IURL = {
  [l: string | Chain]: string;
};

const endpoints: IURL = {
  [CHAIN.CELO]: "https://api.thegraph.com/subgraphs/name/immortalx-io/immortalx",
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const todayTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    const graphQuery = gql`
      {
        protocolByDay(id: "${todayTimestamp}") {
          totalTradingVolume
        }
        protocol(id: "1") {
          totalTradingVolume
        }
      }
    `;

    const res: IProtocolData = await request(endpoints[chain], graphQuery);
    const dailyVolume = Number(res.protocolByDay.totalTradingVolume) / 10 ** 18;
    const totalVolume = Number(res.protocol.totalTradingVolume) / 10 ** 18;

    return {
      timestamp,
      dailyVolume: dailyVolume.toString(),
      totalVolume: totalVolume.toString(),
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.CELO]: {
      fetch: fetch(CHAIN.CELO),
      start: 1690848000,
    },
  },
};

export default adapter;
