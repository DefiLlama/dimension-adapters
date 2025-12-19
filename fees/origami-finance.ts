import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addTokensReceived } from '../helpers/token';

// Fee Collector (Treasury/Multisig) on Ethereum
// Source: https://docs.origami.finance/technical-reference/contracts
const FEE_COLLECTOR = '0x781B4c57100738095222bd92D37B07ed034AB696';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Track protocol revenue collected by the treasury
  // Performance fees (2-10% annually) are minted as vault share tokens to the treasury
  // Note: Deposit/Exit fees are NOT protocol revenue - they accrue to vault shareholders

  // Method: Track all tokens received by the FEE_COLLECTOR address
  // This captures performance fees minted to the treasury
  const revenue = await addTokensReceived({
    options,
    targets: [FEE_COLLECTOR],
  });

  dailyFees.addBalances(revenue);
  dailyRevenue.addBalances(revenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Performance fees (2-10% annually) collected as vault share token inflation minted to treasury. Deposit/exit fees accrue to vault shareholders, not protocol.',
  Revenue: 'Performance fees minted as vault shares to the protocol treasury.',
  ProtocolRevenue:
    'All performance fees are retained by the protocol treasury.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-04-02',
    },
  },
  methodology,
};

export default adapter;
