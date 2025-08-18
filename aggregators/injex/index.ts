import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const fetch = async (timestamp: any) => {
  const res = await fetchURL(`https://inj-api-78847b1b16a1.herokuapp.com/api/volume-stats/usd?timestamp=${timestamp.startOfDay}`);
  return {
    dailyVolume: res.dailyVolume,
  };
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.INJECTIVE]: {
      fetch,
      start: '2024-05-22',
    },
  },
};

export default adapter;
