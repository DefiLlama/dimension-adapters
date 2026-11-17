import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { swapChains } from '../helpers/aggregators/wallet-v/config';
import { addAmount } from '../helpers/aggregators/wallet-v/evm-data';
import { readEvmSwaps } from '../helpers/aggregators/wallet-v/evm-swaps';
import { readSolanaSwaps } from '../helpers/aggregators/wallet-v/solana-swaps';
import { readRangoBridge } from '../helpers/aggregators/wallet-v/rango-bridges';

const swapFees = 'Swap Fees';
const bridgeFees = 'Bridge Affiliate Fees';
const swapRevenue = 'Swap Fees To Wallet V';
const bridgeRevenue = 'Bridge Affiliate Fees To Wallet V';

async function fetch(options: FetchOptions) {
  const swaps = options.chain === CHAIN.SOLANA ? await readSolanaSwaps(options) : await readEvmSwaps(options);
  const bridgePayments = await readRangoBridge(options, 'fees');
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  for (const { fees } of swaps) {
    for (const payment of fees) {
      addAmount(dailyFees, payment, swapFees);
      addAmount(dailyRevenue, payment, swapRevenue);
    }
  }
  for (const payment of bridgePayments) {
    addAmount(dailyFees, payment, bridgeFees);
    addAmount(dailyRevenue, payment, bridgeRevenue);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const revenueBreakdown = {
  [swapRevenue]: 'Same-chain swap service fees paid to Wallet V.',
  [bridgeRevenue]: 'Rango bridge affiliate fees paid to Wallet V.',
};
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: swapChains,
  dependencies: [Dependencies.ALLIUM],
  doublecounted: true, // Some underlying aggregators include affiliate payments in their own gross fees.
  fetch,
  methodology: {
    Fees: 'Wallet V service fees on supported same-chain swaps and Rango bridge affiliate fees on the source chain, excluding inseparable sponsored gas reimbursements.',
    Revenue: 'Verified service fees retained by Wallet V from supported swaps and Rango routes.',
    ProtocolRevenue: 'Swap service fees and Rango affiliate fees sent to Wallet V’s fee accounts.',
  },
  breakdownMethodology: {
    Fees: {
      [swapFees]: 'Wallet V’s fee charged on a successful same-chain swap.',
      [bridgeFees]: 'The Wallet V affiliate share of a supported Rango route.',
    },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
  },
};

export default adapter;
