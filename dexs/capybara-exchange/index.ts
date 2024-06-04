import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../../helpers/getBlock";

interface IGraph {
  dailyTradeVolumeUSD: string;
  dayID: string;
}

interface IProtocol {
  totalTradeVolumeUSD: string;
}

interface IData {
  protocolDayData: IGraph;
  protocols: IProtocol[];
}

type TEndpoint = {
  [s: string | Chain]: string;
};

// Updated using studio
const endpoints: TEndpoint = {
  [CHAIN.KLAYTN]:
    "https://klaytn-graphnode.ecosystem-dev.klaytn.in/cypress/graph/http/subgraphs/name/capy-exchange/capy-klaytn"
};

const fetchVolume = (chain: Chain) => {
  return async (options: FetchOptions): Promise<FetchResultV2> => {
    const { startTimestamp } = options;
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(startTimestamp * 1000)
    );
    const todaysBlock = await getBlock(dayTimestamp, chain, {});
    const dayID = dayTimestamp / 86400;
    const query = gql`
      {
          protocolDayData(id: "${dayID}") {
              dayID
              dailyTradeVolumeUSD
          },
          protocols(block: { number: ${todaysBlock} }) {
            totalTradeVolumeUSD
          }
      }`;
    const response: IData = await request(endpoints[chain], query);
    const dailyVolume =
      Number(response.protocolDayData.dailyTradeVolumeUSD) / 2;
    const totalTradeVolumeUSD =
      Number(response.protocols[0].totalTradeVolumeUSD) / 2;
    return {
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      totalVolume: totalTradeVolumeUSD ? `${totalTradeVolumeUSD}` : undefined,
      timestamp: dayTimestamp
    };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch: fetchVolume(CHAIN.KLAYTN),
      start: 1715752335
    }
  }
};

export default adapter;
