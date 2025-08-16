import { Adapter, FetchResultV2, FetchV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const echoStakingApiURL = 'https://vault.echo-protocol.xyz/external/v1/defillama/get_fee_revenues';

interface EchoStakingStats {
  data: {
    echo_revenue: string;
    user_revenue: string;
    total_revenue: string;
  }
}

const methodology = {
  Fees: 'Staking rewards earned by all staked APT',
  ProtocolRevenue: 'Staking rewards',
};

const fetchEchoStakingStats: FetchV2 = async ({
  startTimestamp,
  endTimestamp,
}): Promise<FetchResultV2> => {
  const url = `${echoStakingApiURL}?type=lsd&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`;
  const { data }: EchoStakingStats = await fetchURL(url);
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
      fetch: fetchEchoStakingStats,
      start: '2025-07-09',
    },
  },
  methodology,
};

export default adapter;

