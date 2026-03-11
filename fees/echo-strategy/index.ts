import { Adapter, FetchResultV2, FetchV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const echoStrategyApiURL = 'https://vault.echo-protocol.xyz/external/v1/defillama/get_fee_revenues';

interface EchoStrategyStats {
  data:{
    echo_revenue: string;
    user_revenue: string;
    total_revenue: string;
  }
}

const methodology = {
  Fees: 'Strategy rewards earned by all staked APT',
  ProtocolRevenue: 'Strategy rewards',
};

const fetchEchoStrategyStats: FetchV2 = async ({
  startTimestamp,
  endTimestamp,
}): Promise<FetchResultV2> => {
  const url = `${echoStrategyApiURL}?type=strategy&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`;
  const { data }: EchoStrategyStats = await fetchURL(url);
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
      fetch: fetchEchoStrategyStats,
      start: '2025-07-09',
    },
  },
  methodology,
};

export default adapter;

