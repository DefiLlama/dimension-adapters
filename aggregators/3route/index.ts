import { gql, request } from "graphql-request";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";

interface DappStat {
  volume_usd: number;
}

interface DailyVolumeResponse {
  dapp_stat_1d: DappStat[];
}

const dappSlug = '3route'
const endpoint = 'https://dapps-indexer.dipdup.net/v1/graphql';

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


const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions): Promise<FetchResult> => {
  const startDate = new Date(getTimestampAtStartOfDayUTC(startTimestamp) * 1000).toISOString()
  const endDate = new Date(getTimestampAtStartOfDayUTC(endTimestamp) * 1000).toISOString()

  const response = await request<DailyVolumeResponse>(endpoint, query, { dappSlug, startDate, endDate })
  if (response.dapp_stat_1d.length == 0) {
    return { dailyVolume: 0 }
  }

  return {
    dailyVolume: response.dapp_stat_1d[0].volume_usd
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TEZOS]: {
      fetch,
      start: '2022-11-15',
    },
  },
};

export default adapter;
