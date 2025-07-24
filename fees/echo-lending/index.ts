import { Adapter, FetchResultV2, FetchV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const echoLendingApiURL = 'https://vault.echo-protocol.xyz/external/v1/defillama/get_fee_revenues';

interface EchoLendingStats {
  data: {
    echo_revenue: string;
    user_revenue: string;
    total_revenue: string;
  }
}

const methodology = {
  Fees: 'Interest paid by borrowers',
  ProtocolRevenue: 'Percentage of interest going to treasury',
};

const fetchEchoLendingStats: FetchV2 = async ({
  startTimestamp,
  endTimestamp,
}): Promise<FetchResultV2> => {
  const url = `${echoLendingApiURL}?type=lending&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`;
  const { data }: EchoLendingStats = await fetchURL(url);
  return {
    dailyFees: data.total_revenue,
    dailyRevenue: data.echo_revenue,
    dailyProtocolRevenue: data.echo_revenue,
    dailySupplySideRevenue: data.user_revenue
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchEchoLendingStats,
      start: '2025-07-23',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;

