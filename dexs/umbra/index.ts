import { Fetch, FetchV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import axios from 'axios';

type VolumeItem = {
  timestamp: number;
  data: number;
};

type VolumeResponse = {
  result: VolumeItem[];
};

const fetch: Fetch = async (timestamp) => {
  const baseUrl = 'https://api.umbra.finance/1/explore/volume';

  const dailyVolumeFetch = axios
    .get<VolumeResponse>(`${baseUrl}?timeframe=D`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    .then((response) => response.data.result);

  const [dailyVolumeItems] = await Promise.all([
    dailyVolumeFetch,
  ]);

  // sort desc and get latest item found before given timestamp
  const dailyVolumeItem = dailyVolumeItems
    .sort((a, b) => b.timestamp - a.timestamp)
    .find((item) => item.timestamp <= timestamp);

  const dailyVolumeUsd = dailyVolumeItem?.data ?? 0;

  return {
    dailyVolume: dailyVolumeUsd,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ECLIPSE]: {
      fetch: fetch,
      start: '2025-02-22',
    },
  },
  methodology: {
    Volume:
      "USD Volume of Umbra V3 using datasource from protocol's indexed data.",
  },
};

export default adapter;
