import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const echoStakingApiURL = 'https://vault.echo-protocol.xyz/external/v1/defillama/get_fee_revenue';

interface EchoStakingStats {
  data:{
    fee: string;
    revenue: string;
  }
}

const fetch = async (options: FetchOptions) => {
  const url = `${echoStakingApiURL}?type=lsd&startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const { data }: EchoStakingStats = await fetchURL(url);
  const dailyFees = data.fee;
  const dailyRevenue = data.revenue;

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Staking rewards earned by all staked APT',
  Revenue: 'Staking rewards to protocol',
  ProtocolRevenue: 'Staking rewards to protocol',
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2025-04-06',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;

