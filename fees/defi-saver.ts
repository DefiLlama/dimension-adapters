import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FeeWallet = '0x6467e807db1e71b9ef04e0e3afb962e4b0900b2b';
const LABEL = 'Service Fees';

// DeFi Saver's own wallets: the fee wallet periodically sweeps its balance to them,
// so tokens coming back from them are internal moves, not new fees.
const OwnWallets = new Set([
  '0x6e7c1e40420de8d2d03b643c42419e7568895cbc', // 3-of-6 treasury Safe, receives sweeps since 2026-07; sent 100 WETH back in tx 0x63be166098ad9a69b7b15bc49d1744f0562c50f6bbf3afbf4c025ac3f765c42c (2026-11-04)
  '0x5762face92f9fc11c2190ec06a2e31038b21092d', // 3-of-6 treasury Safe, 5 of 6 owners shared with 0x6e7c...; sent WETH back on 2024-04-16 and 2024-08-05
  '0x3e9598a5f8faa9e360befd18f397f29e254dcea0', // 2-of-4 Safe sharing 2 owners with the treasury Safes, receives sweeps
  '0x76720ac2574631530ec8163e4085d6f98513fb27', // team EOA: fee receiver until 2021-09, receives sweeps, executes 0x5762... Safe txs; sent WETH back on 2024-08-05
]);

const fetch = async (options: FetchOptions) => {
  const receivedFees = await addTokensReceived({
    options,
    target: FeeWallet,
    logFilter: (log) => !OwnWallets.has(log.from),
  })

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addBalances(receivedFees, LABEL);
  dailyRevenue.addBalances(receivedFees, LABEL);
  dailyProtocolRevenue.addBalances(receivedFees, LABEL);
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2022-01-01',
    }
  },
  methodology: {
    Fees: 'Total fees paid by users for using DefiSaver services, excluding tokens sent back to the fee wallet from DefiSaver\'s own treasury wallets.',
    Revenue: 'Total fees paid are distributed to DefiSaver.',
    ProtocolRevenue: 'Total fees paid are distributed to DefiSaver.',
  },
  breakdownMethodology: {
    Fees: {
      [LABEL]: 'Fees paid by users for using Defi Saver services.',
    },
    Revenue: {
      [LABEL]: 'Fees distributed to Defi Saver.',
    },
    ProtocolRevenue: {
      [LABEL]: 'Fees distributed to Defi Saver.',
    },
  },
}
export default adapter;
