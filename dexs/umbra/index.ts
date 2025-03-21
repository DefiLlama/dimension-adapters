import { SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import axios from 'axios';

const fetch = async () => {
  const url = 'https://api.umbra.finance/1/explore/volume?timeframe=M';
  const volumeItems = await axios<{
    result: { timestamp: number; data: number }[];
  }>(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  }).then((response) => response.data.result);

  const totalVolumeUsd = volumeItems.reduce(
    (sum, { data }) => (sum = sum + data),
    0
  );

  return {
    totalVolume: totalVolumeUsd,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ECLIPSE]: {
      fetch: fetch,
      meta: {
        methodology: {
          Volume:
            "USD Volume of Umbra V3 using datasource from protocol's indexed data.",
        },
      },
    },
  },
};

export default adapter;
