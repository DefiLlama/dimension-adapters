import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "../../adapters/types";
import BigNumber from 'bignumber.js';

interface IGraph {
  dailyTradeVolumeUSD: string;
  dayID: string;
}

interface IData {
  protocolDayData: IGraph;
}

// Updated using studio
const endpoints: Record<Chain, string> = {
  [CHAIN.KLAYTN]: "https://subgraph-proxy.wombat.exchange/capy-kaia/data"
};

const feesRatio = 0.0004;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { startTimestamp } = options;
  const dayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(startTimestamp * 1000)
  );
  const dayID = dayTimestamp / 86400;
  const query = gql`
    {
        protocolDayData(id: "${dayID}") {
            dayID
            dailyTradeVolumeUSD
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
    },
  }
};

export default adapter;
