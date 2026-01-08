import request, { gql } from 'graphql-request';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getTimestampAtStartOfDayUTC } from '../utils/date';

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]:
    'https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql',
  [CHAIN.AVAX]:
    'https://gmx.squids.live/gmx-synthetics-avalanche:prod/api/graphql',
  [CHAIN.BOTANIX]:
    'https://gmx.squids.live/gmx-synthetics-botanix:prod/api/graphql',
};

const historicalDataSwap = gql`
  query get_volume($period: String!) {
    volumeInfos(
      where: { period_eq: $period }
      limit: 1
      orderBy: timestamp_DESC
    ) {
      swapVolumeUsd
    }
  }
`;

interface IGraphResponse {
  volumeInfos: Array<{
    swapVolumeUsd: string;
  }>;
}

const fetch = async (_tt: number, _t: any, options: FetchOptions) => {
  const dailyData: IGraphResponse = await request(
    endpoints[options.chain],
    historicalDataSwap,
    {
      period: '1d',
    }
  );
  const dailyVolume =
    dailyData.volumeInfos.length > 0
      ? Number(dailyData.volumeInfos[0].swapVolumeUsd) * 10 ** -30
      : 0;

  return {
    dailyVolume,
  };
};

const fetchSolana = async (_tt: number, _t: any, options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay);
  const targetDate = new Date(dayTimestamp * 1000).toISOString();
  const query = gql`
    {
      volumeRecordDailies(
        where: {timestamp_lte: "${targetDate}"},
        orderBy: timestamp_ASC
      ) {
          timestamp
          swapVolume
      }
    }
  `;

  const url =
    'https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql';
  const res = await request(url, query);

  const dailyVolume = res.volumeRecordDailies
    .filter(
      (record: { timestamp: string }) =>
        record.timestamp.split('T')[0] === targetDate.split('T')[0]
    )
    .reduce(
      (acc: number, record: { swapVolume: string }) =>
        acc + Number(record.swapVolume),
      0
    );
  if (dailyVolume === 0) throw new Error('Not found daily data!.');

  return {
    dailyVolume: dailyVolume / 10 ** 20,
  };
};

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
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2021-08-31',
    },
  },
};

export default adapter;
