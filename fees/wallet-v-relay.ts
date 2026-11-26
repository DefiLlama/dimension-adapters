import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { prefetchWalletVRelay, walletVRelayChainConfig, walletVRelayMetrics } from '../helpers/wallet-v-relay';

const BRIDGE_FEES = 'Bridge Affiliate Fees';
const BRIDGE_REVENUE = 'Bridge Affiliate Fees To Wallet V';

async function fetch(options: FetchOptions) {
  const { appFeesUsd } = walletVRelayMetrics(options);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addUSDValue(appFeesUsd, BRIDGE_FEES, { id: 'wallet-v-relay' });
  dailyRevenue.addUSDValue(appFeesUsd, BRIDGE_REVENUE, { id: 'wallet-v-relay' });
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: walletVRelayChainConfig(),
  prefetch: prefetchWalletVRelay,
  fetch,
  doublecounted: true,
  methodology: {
    Fees: 'Actual Relay app fees paid to the Wallet V fee recipient on successful Wallet V cross-chain requests, in USD and grouped by source chain and UTC request creation date.',
    Revenue: 'The portion of Relay app fees kept by Wallet V, as reported by the Wallet V daily API.',
    ProtocolRevenue: 'Relay app fees paid to the Wallet V fee recipient.',
  },
  breakdownMethodology: {
    Fees: { [BRIDGE_FEES]: 'Relay app fee paid to Wallet V on a cross-chain request.' },
    Revenue: { [BRIDGE_REVENUE]: 'Relay app fee kept by Wallet V.' },
    ProtocolRevenue: { [BRIDGE_REVENUE]: 'Relay app fee paid to the Wallet V fee recipient.' },
  },
};

export default adapter;
