import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const methodology = {
  Fees: 'Total fees paid from swaps',
  ProtocolReveneue: 'The portion of the total fees going to the STEAMM treasury'
}

const fetchSteammStats = async ({ startTimestamp, endTimestamp, createBalances }: FetchOptions) => {
  const url = `https://api.suilend.fi/steamm/historical/fees?startTimestampS=${startTimestamp}&endTimestampS=${endTimestamp}&intervalS=86400`
  const [stats]: any = (await fetchURL(url));
  const dailyFees = createBalances()
  Object.entries(stats.fees).forEach(([token, fees]: any) => dailyFees.add(token, fees))

  return {
    dailyFees,
  };
};



const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSteammStats,
      start: '2025-02-16',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
