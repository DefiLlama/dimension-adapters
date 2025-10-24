import axios from 'axios';

import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const startBlock = await options.getStartBlock();
  const endBlock = await options.getEndBlock();
  const url = `https://api.kensei.one/fees/by-block?startBlock=${startBlock}&endBlock=${endBlock}`;

  const res = await axios.get<any>(url);
  if (res.status !== 200) {
    throw new Error('Failed to fetch fees');
  }


  const dailyFees = res.data;
  const dailyRevenue = res.data;;
  const dailyProtocolRevenue = res.data;;

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: 'Tokens trading and launching fees paid by users.',
    Revenue: 'Tokens trading and launching fees paid by users.',
    ProtocolRevenue: 'Tokens trading and launching fees paid by users.',
  },
  version: 2,
  adapter: {
    [CHAIN.KATANA]: {
      fetch,
      start: '2025-10-16',
    },
  },
};

export default adapter;
