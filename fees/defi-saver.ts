import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// FeeReceiver per chain, from DeFi Saver's own address book:
// https://github.com/defisaver/defisaver-v3-contracts/tree/main/addresses
// The L2 receivers were added in commit 0f4865c7 ("chore: deploy fee receiver on l2s", 2026-07-01).
// Each chain's FeeRecipient pointer returns its receiver, e.g. arbitrum 0xe000e3c9...getFeeAddr() -> 0x47b61a9E...
// Where L2 fees went before that date is not tracked here.
const FeeWallets: Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x6467e807db1e71b9ef04e0e3afb962e4b0900b2b',
  [CHAIN.ARBITRUM]: '0x47b61a9Ec0c09B39653e55e6ad748dAcaF06D0a7',
  [CHAIN.BASE]: '0x0909201d8bc9906C95B248c1A4476C07a7769983',
};
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
    target: FeeWallets[options.chain],
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
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: '2026-07-02', // first inflow: block 479597099, tx 0xf28a65e2e8ad65a61d47ca428ff2246344427f1c26beda71dc4c335b22f0e2fa
    },
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2026-06-30', // FeeReceiver deployed at block 48014786; first inflow not pinned (public Base RPCs returned empty or errors)
    },
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
