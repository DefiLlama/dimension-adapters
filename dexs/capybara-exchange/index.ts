import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";
import BigNumber from 'bignumber.js';

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

const feesRatio = 0.0004;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { startTimestamp } = options;
  const dayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(startTimestamp * 1000)
  );
  const todaysBlock = await getBlock(dayTimestamp, options.chain, {});
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
  const response: IData = await request(endpoints[options.chain], query);
  const dailyVolume = Number(response.protocolDayData.dailyTradeVolumeUSD) / 2;
  const dailyFees = new BigNumber(dailyVolume ? dailyVolume : '0').multipliedBy(feesRatio).toString()

  return {
    dailyVolume: dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: '2024-05-15'
    }
  }
};

export default adapter;
