import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { addToken, chainConfig, fetchRelayTotals, fetchWalletV, RelayTotals, withRelayChains } from '../helpers/aggregators/wallet-v';

const SWAP_FEES = 'Swap Fees';
const BRIDGE_FEES = 'Bridge Affiliate Fees';
const RELAY_FEES = 'Relay App Fees';
const SWAP_REVENUE = 'Swap Fees To Wallet V';
const BRIDGE_REVENUE = 'Bridge Affiliate Fees To Wallet V';
const RELAY_REVENUE = 'Relay App Fees To Wallet V';

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  if (chainConfig[options.chain]) {
    for (const { kind, token, amount } of await fetchWalletV(options)) {
      if (kind === 'volume') continue;
      addToken(dailyFees, token, amount, kind === 'swap' ? SWAP_FEES : BRIDGE_FEES);
      addToken(dailyRevenue, token, amount, kind === 'swap' ? SWAP_REVENUE : BRIDGE_REVENUE);
    }
  }
  const relayFeesUsd = (options.preFetchedResults as RelayTotals)[options.chain]?.feesUsd ?? 0;
  dailyFees.addUSDValue(relayFeesUsd, RELAY_FEES);
  dailyRevenue.addUSDValue(relayFeesUsd, RELAY_REVENUE);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const revenueBreakdown = {
  [SWAP_REVENUE]: 'Wallet V service fee on swaps, kept in its fee wallet.',
  [BRIDGE_REVENUE]: 'Rango affiliate fee on bridges made through Wallet V, kept in its fee wallet.',
  [RELAY_REVENUE]: 'Relay app fee on transfers made through Wallet V, claimed to its fee wallet.',
};

const adapter: SimpleAdapter = {
  // Allium lags behind the hourly run, so its readiness check fails nearly every hour
  version: 1,
  adapter: withRelayChains(chainConfig),
  prefetch: fetchRelayTotals,
  dependencies: [Dependencies.ALLIUM],
  doublecounted: true,
  fetch,
  methodology: {
    Fees: 'Service fees users pay Wallet V on swaps routed through 1inch, OKX, KyberSwap, Jupiter and other aggregators, plus its affiliate fee on bridges through Rango and its app fee on transfers through Relay. Fees on gas-sponsored smart-wallet swaps are included and can also cover the gas Wallet V pays.',
    Revenue: 'All swap service fees, Rango affiliate fees and Relay app fees, kept by Wallet V.',
    ProtocolRevenue: 'All swap service fees, Rango affiliate fees and Relay app fees, sent to Wallet V fee wallets.',
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: 'Wallet V service fee paid to its fee wallet in the same transaction as an aggregator swap.',
      [BRIDGE_FEES]: 'Wallet V affiliate fee paid by Rango on bridges made through Wallet V.',
      [RELAY_FEES]: 'Wallet V app fee on transfers made through Relay, as Relay reports it paid to Wallet V.',
    },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
  },
};

export default adapter;
