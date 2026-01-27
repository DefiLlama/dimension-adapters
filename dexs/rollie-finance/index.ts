import request, { gql } from 'graphql-request';
import {FetchOptions, FetchResultV2, FetchV2, SimpleAdapter} from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import {
  getUniqStartOfTodayTimestamp,
} from '../../helpers/getUniSubgraphVolume';

const ENDPOINTS: { [key: string]: string } = {
  [CHAIN.SCROLL]: 'https://api.studio.thegraph.com/query/76203/rollie-finance/0.0.3/',
};
const USDC_DECIMALS: { [key: string]: number } = {
  [CHAIN.SCROLL]: 6,
};

const getVolume = gql`
  query get_volume($id: String!) {
    market(id: "1") {
      id
      tradeVolume
      marketDayDatas(where: {id: $id}) {
        id
        tradeVolume
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
        ? (BigInt(response.marketDayDatas[0].tradeVolume) /
          BigInt(10 ** USDC_DECIMALS[chain])).toString()
        : '0',
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: getFetch(CHAIN.SCROLL),
      start: '2024-05-09',
    },
  },
};

export default adapter;
