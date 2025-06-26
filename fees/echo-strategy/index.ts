import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const echoStrategyApiURL = 'https://vault.echo-protocol.xyz/external/v1/defillama/get_fee_revenue';

interface EchoStrategyStats {
  data:{
    fee: string;
    revenue: string;
  }
}

const fetch = async (options: FetchOptions) => {
  const url = `${echoStrategyApiURL}?type=strategy&startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const { data }: EchoStrategyStats = await fetchURL(url);
  const dailyFees = data.fee;
  const dailyRevenue = data.revenue;

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Strategy rewards earned by all staked APT',
  Revenue: 'Strategy rewards to protocol',
  ProtocolRevenue: 'Strategy rewards to protocol',
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
