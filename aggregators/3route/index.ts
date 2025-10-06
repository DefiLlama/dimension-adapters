import { gql, request } from "graphql-request";

import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";

interface DappStat {
  volume_usd: number;
}

interface TezosVolumeResponse {
  dapp_stat_1d: DappStat[];
}

interface EtherlinkVolumeResponse {
  day: string;
  total_volume: number;
}

const dappSlug = '3route'
const tezosURL = 'https://dapps-indexer.dipdup.net/v1/graphql';
const etherlinkURL = 'https://3route-etherlink.dipdup.net/v1/volume/day'

const query = gql`
  query GetDailyVolume($dappSlug: String!, $startDate: timestamptz!, $endDate: timestamptz!) {
    dapp_stat_1d(
      where: {
        dapp_slug: {_eq: $dappSlug}
        bucket: {
          _gte: $startDate
          _lt: $endDate
        }
      }
    ) {
      volume_usd
    }
  }
`;


const fetchTezos = async (_: any, _1: any, { startOfDay }: FetchOptions): Promise<FetchResult> => {
  const startDate = new Date(startOfDay * 1000).toISOString()
  const endDate = new Date((startOfDay + 86400) * 1000).toISOString()

  const response = await request<TezosVolumeResponse>(tezosURL, query, { dappSlug, startDate, endDate })
  if (response.dapp_stat_1d.length == 0) {
    return { dailyVolume: 0 }
  }

  return {
    dailyVolume: response.dapp_stat_1d[0].volume_usd
  }
}

const fetchEtherlink = async (_: any, _1: any, { startOfDay }: FetchOptions): Promise<FetchResult> => {
  const startDate = new Date(startOfDay * 1000).toISOString().split('T')[0]
  const endDate = new Date((startOfDay + 86400) * 1000).toISOString().split('T')[0]

  const response: EtherlinkVolumeResponse[] = await fetchURL(`${etherlinkURL}?start=${startDate}&end=${endDate}`);
  if (response.length == 0) {
    return { dailyVolume: 0 }
  }

  return {
    dailyVolume: response[0].total_volume
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetchTezos,
      start: '2022-11-15',
    },
    [CHAIN.ETHERLINK]: {
      fetch: fetchEtherlink,
      start: '2025-09-01',
    },
  },
};

export default adapter;
