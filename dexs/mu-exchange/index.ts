import * as sdk from "@defillama/sdk";
import request, { gql } from 'graphql-request';
import { SimpleAdapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

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

const fetch = async (options: FetchOptions) => {
  const dayIndex = Math.floor(options.toTimestamp / 86400);
  const { market: response } = await request(ENDPOINTS[options.chain],
    getVolume, {
    id: String(dayIndex),
  });

  return {
    dailyVolume:
      response.marketDayDatas.length === 1
        ? (BigInt(response.marketDayDatas[0].tradeVolume) /
          BigInt(10 ** SDAI_DECIMALS[options.chain])).toString()
        : undefined,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.XDAI],
  start: '2023-11-09',
};

export default adapter;
