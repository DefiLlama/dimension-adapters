import { SimpleAdapter, FetchOptions } from '../adapters/types';
import { CHAIN } from "../helpers/chains";
import { BRIDGE, SENT_ABI, tokenFromSourceAddress } from "../helpers/allbridge";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({ target: BRIDGE, eventAbi: SENT_ABI });
  for (const log of logs) {
    if (options.chain === CHAIN.ETHEREUM) {
      dailyFees.addUSDValue(1, 'Bridge Fees');
      continue;
    }
    const fee = (BigInt(log.amount) * 3n) / 1000n;
    const token = tokenFromSourceAddress(log.tokenSourceAddress);
    if (token) dailyFees.add(token, fee);
    else dailyFees.addGasToken(fee);
  }
  const dailyRevenue = dailyFees.clone(0.2, 'Bridge Fees');
  const dailySupplySideRevenue = dailyFees.clone(0.8, 'Bridge Fees');

  return {
    dailyFees,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Bridge-fee estimate reconstructed on-chain at the documented nominal rate (0.3%, $1 flat on Ethereum); ABR-staker discounts mean actuals read slightly lower, and one observed transfer carried an unexplained side transfer whose fee role is unconfirmed.",
  ProtocolRevenue: "20% of bridge fees, kept by the protocol.",
  SupplySideRevenue: "80% of bridge fees, distributed as staking rewards.",
};

const breakdownMethodology = {
  Fees: {
    "Bridge Fees": "Fees charged to users for each cross-chain token transfer on the source chain.",
  },
  ProtocolRevenue: {
    "Bridge Fees": "20% of bridge fees collected by the protocol treasury.",
  },
  SupplySideRevenue: {
    "Bridge Fees": "80% of bridge fees distributed as rewards to stakers who provide liquidity.",
  },
};

// On-chain rebuild 2026-10: the legacy stats API (stats.a11bd.net) went dark,
// freezing this series at 2026-08-30. Same 6 documented EVM legs as dexs.
// Starts are gap-fill guards (not earliest-data dates): pre-2026-08-30 history
// stays exactly as the legacy API recorded it and must not be recomputed.
// Non-EVM/sunset legs commented out with reasons (see dexs/allbridge-classic).
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2026-08-30' },
    [CHAIN.BSC]: { start: '2026-08-30' },
    [CHAIN.POLYGON]: { start: '2026-08-30' },
    [CHAIN.AVAX]: { start: '2026-08-30' },
    [CHAIN.CELO]: { start: '2026-08-30' },
    [CHAIN.FANTOM]: { start: '2026-08-30' },
    // [CHAIN.AURORA]: EVM but no documented fee rate; follow-up
    // [CHAIN.FUSE]: EVM but no documented fee rate; follow-up
    // [CHAIN.SOLANA]: needs Solana program-log parsing; follow-up
    // [CHAIN.NEAR]: needs Near receipt parsing; follow-up
    // [CHAIN.TEZOS]: needs Tezos indexing; follow-up
    // [CHAIN.KLAYTN]: archive RPC unreliable; follow-up
    // [CHAIN.WAVES]: needs Waves node API; follow-up
    // [CHAIN.STELLAR]: needs Stellar Horizon API; follow-up
    // [CHAIN.STACKS]: needs Stacks API (0.1% rate documented); follow-up
    // [CHAIN.TERRA]: chain sunset; history frozen
    // [CHAIN.HARMONY]: chain sunset; history frozen
    // [CHAIN.HECO]: skipped before too; history frozen
  },
  methodology,
  breakdownMethodology,
}

export default adapter;
