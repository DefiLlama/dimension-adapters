import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IData {
  totalTradeFee: string;
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
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todayTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    const graphQuery = gql`
      {
        protocolByDay(id: "${todayTimestamp}") {
          totalTradeFee
        }
        protocol(id: "1") {
          totalTradeFee
        }
      }
    `;

    const res: IProtocolData = await request(endpoints[chain], graphQuery);
    const dailyFees = Number(res.protocolByDay.totalTradeFee) / 10 ** 18;
    const totalFees = Number(res.protocol.totalTradeFee) / 10 ** 18;

    return {
      timestamp,
      dailyFees: dailyFees.toString(),
      totalFees: totalFees.toString(),
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
