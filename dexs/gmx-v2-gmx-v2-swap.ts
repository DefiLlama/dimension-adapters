import request, { gql } from 'graphql-request';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getTimestampAtStartOfDayUTC } from '../utils/date';

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: 'https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql',
  [CHAIN.AVAX]: 'https://gmx.squids.live/gmx-synthetics-avalanche:prod/api/graphql',
  [CHAIN.BOTANIX]: 'https://gmx.squids.live/gmx-synthetics-botanix:prod/api/graphql',
  [CHAIN.MEGAETH]: "https://gmx.squids.live/gmx-synthetics-megaeth:prod/api/graphql",
};

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay)
  const query = gql`
    query get_volume($id: String!) {
      volumeInfos(where: {id_eq: $id, period_eq: "1d"}, limit: 1) {
        swapVolumeUsd
      }
    }
  `
  const dailyData = await request(endpoints[options.chain], query, {
    id: '1d:' + String(dayTimestamp),
  })

  const dailyVolume = dailyData.volumeInfos.length > 0
    ? Number(dailyData.volumeInfos[0].swapVolumeUsd) * 10 ** -30
    : 0

  return {
    dailyVolume,
  }
}

const methodology = {
  Volume: 'Sum of daily total volume for all markets on a given day.',
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2021-08-31',
    },
    [CHAIN.AVAX]: {
      start: '2021-12-22',
    },
    [CHAIN.BOTANIX]: {
      start: '2025-05-30',
    },
    [CHAIN.MEGAETH]: { start: '2026-04-08', },
  },
};

export default adapter;
