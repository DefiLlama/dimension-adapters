import * as sdk from "@defillama/sdk";
import request, { gql } from 'graphql-request';
import { Fetch, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import {
  getUniqStartOfTodayTimestamp,
} from '../../helpers/getUniSubgraphVolume';

const ENDPOINTS: { [key: string]: string } = {
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('7LkMoW2UtUVauMkexF75bowQp2DE6bNB3jUXySYtBp9x'),
};
const SDAI_DECIMALS: { [key: string]: number } = {
  [CHAIN.XDAI]: 18,
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

const getFetch = (chain: string): Fetch => async (timestamp: number) => {
  const dayIndex = Math.floor(timestamp / 86400);
  const { market: response } = await request(ENDPOINTS[chain],
    getVolume, {
      id: String(dayIndex),
    });

  return {
    timestamp: getUniqStartOfTodayTimestamp(new Date((timestamp * 1000))),
    dailyVolume:
      response.marketDayDatas.length === 1
        ? (BigInt(response.marketDayDatas[0].tradeVolume) /
          BigInt(10 ** SDAI_DECIMALS[chain])).toString()
        : undefined,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.XDAI]: {
      fetch: getFetch(CHAIN.XDAI),
      start: '2023-11-09',
    },
  },
};

export default adapter;
