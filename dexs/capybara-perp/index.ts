import request, { gql } from 'graphql-request';
import {FetchOptions, FetchResultV2, FetchV2, SimpleAdapter} from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import {
  getUniqStartOfTodayTimestamp,
} from '../../helpers/getUniSubgraphVolume';

const ENDPOINTS: { [key: string]: string } = {
  [CHAIN.KLAYTN]: 'https://klaytn-graphnode.ecosystem-dev.klaytn.in/cypress/graph/http/subgraphs/name/capy-beta-u/perp',
};

const getVolume = gql`
  query get_volume($id: String!) {
    market(id: "1") {
      id
      tradeVolumeUSD
      marketDayDatas(where: {id: $id}) {
        id
        tradeVolumeUSD
     }
    }
  }
`;


const getFetch = (chain: string): FetchV2 => async (options: FetchOptions): Promise<FetchResultV2> => {
  const { startTimestamp} = options;
  const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(startTimestamp * 1000)
  );
  const dayIndex = Math.floor(options.startOfDay / 86400);

  const { market: response } = await request(ENDPOINTS[chain],
    getVolume, {
      id: String(dayIndex),
    });

  return {
    timestamp: getUniqStartOfTodayTimestamp(new Date(dayTimestamp)),
    dailyVolume:
      response.marketDayDatas.length === 1
        ? response.marketDayDatas[0].tradeVolumeUSD
        : '0',
    totalVolume: response.tradeVolumeUSD,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch: getFetch(CHAIN.KLAYTN),
      start: '2024-09-29',
    },
  },
};

export default adapter;
