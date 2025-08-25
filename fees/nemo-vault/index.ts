import { Adapter, FetchResultV2, FetchV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const nemoApiURL = 'https://api.nemoprotocol.com/api/v1/market/fee';

interface NemoStats {
  data:{
    fee: string;
  }
}

const methodology = {
  Fees: 'The performance fee is the fee that curators charge in regular vault operations.',
};

const fetchNemoStats: FetchV2 = async ({
  startTimestamp,
  endTimestamp,
}): Promise<FetchResultV2> => {
  const url = `${nemoApiURL}?starttime=${startTimestamp}&endtime=${endTimestamp}&tradeType=2`;
  const { data }: NemoStats = await fetchURL(url);
  const dailyFees = data.fee;
  return {
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchNemoStats,
      start: '2025-08-20',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
