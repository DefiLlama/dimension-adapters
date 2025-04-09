import { Adapter, FetchResultV2, FetchV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const echoStakingApiURL = 'https://vault.echo-protocol.xyz/external/v1/defillama/get_fee_revenue';

interface EchoStakingStats {
  data:{
    fee: string;
    revenue: string;
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
      fetch: fetchEchoStakingStats,
      start: '2025-04-06',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;

