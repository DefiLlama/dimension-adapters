import { Adapter, FetchOptions } from '../../adapters/types';
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

const fetch = async (options: FetchOptions) => {
  const url = `${echoLendingApiURL}?type=lending&startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const { data }: EchoLendingStats = await fetchURL(url);

  return {
    dailyFees: data.total_revenue,
    dailyRevenue: data.echo_revenue,
    dailyProtocolRevenue: data.echo_revenue,
    dailySupplySideRevenue: data.user_revenue
  };
};

const methodology = {
  Fees: 'Interest paid by borrowers',
  Revenue: 'Protocol share from the interest paid and fees',
  ProtocolRevenue: 'Protocol share from the interest paid and fees',
  SupplySideRevenue: 'Interest paid to lenders',
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2025-07-23',
    },
  },
  methodology,
};

export default adapter;

