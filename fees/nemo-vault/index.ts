import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const nemoApiURL = 'https://api.nemoprotocol.com/api/v1/market/fee';

interface NemoStats {
  data: {
    fee: string;
  }
}

const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const url = `${nemoApiURL}?starttime=${startTimestamp}&endtime=${endTimestamp}&tradeType=2`;
  const { data }: NemoStats = await fetchURL(url);
  const dailyFees = data.fee;
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: 'The performance fee is the fee that curators charge in regular vault operations.',
  Revenue: 'The performance fee is the fee that curators charge in regular vault operations.',
  ProtocolRevenue: 'The performance fee is the fee that curators charge in regular vault operations.',
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  methodology,
  start: '2025-08-20',
};

export default adapter;
