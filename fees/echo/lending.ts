import { Adapter, FetchResultV2, FetchV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const echoLendingApiURL = 'https://vault.echo-protocol.xyz/external/v1/defillama/get_fee_revenue';

interface EchoLendingStats {
  data:{
    fee: string;
    revenue: string;
  }
}

const fetchEchoLendingStats: FetchV2 = async ({
  startTimestamp,
  endTimestamp,
}): Promise<FetchResultV2> => {
  const url = `${echoLendingApiURL}?type=lending&startTimestamp=${Math.floor(startTimestamp / 1000)}&endTimestamp=${Math.floor(endTimestamp / 1000)}`;
  const { data }: EchoLendingStats = await fetchURL(url);
  const dailyFees = data.fee;
  const dailyRevenue = data.revenue;
  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchEchoLendingStats,
      start: '2025-01-20',
    },
  },
};

export default adapter;

