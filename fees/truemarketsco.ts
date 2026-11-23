import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";

// True Markets (https://truemarkets.co, https://x.com/truemarketsco): non-custodial trading app, API and agents for
// tokenized stocks and crypto. Swaps are routed through 0x / KyberSwap on Base and Robinhood Chain and Jupiter on
// Solana; the True Markets fee is taken in the trade's stablecoin inside the same user operation / transaction and
// sent to the fee collector wallets below (confirmed by True Markets).
// App swaps pay 1% on-chain, e.g. 5 USDC on a 500 USDC swap (Base tx 0x536c47b3281edb1f4f76dc5baad88a6b9468e7089195cdd9a0a7124296f208e2).
// The same collectors also take a fee on stablecoin sends/withdrawals (e.g. a flat 1 USDC,
// Base tx 0x9b32c17294f309d9d383704b590acaaed075f874ca812dc5f292e63056923773). Both are user-paid and counted; they
// cannot be told apart from the collector transfer alone, so they share one label.
// Hyperliquid builder-code fees are tracked separately in factory/hyperliquid.ts (truemarketsco-perps / -spot).

// Same fee collector on Base and Robinhood Chain.
// https://base.blockscout.com/address/0x62f00D95FFE2071F0EbdCf898Caa384DDCEC71C5
// https://robinhoodchain.blockscout.com/address/0x62f00D95FFE2071F0EbdCf898Caa384DDCEC71C5
const EVM_FEE_COLLECTOR = "0x62f00D95FFE2071F0EbdCf898Caa384DDCEC71C5";
// https://solscan.io/account/DmVApZ3sSbAdm9mqoMnGxH5RpBHRtEDAZLvKSt9k5MhW
// App transactions that pay this collector are co-signed by the True Markets gas sponsor
// A93NGHwpaa5xB7kzuiWqhCzZjtdhNFa8g4gduk3wvdXy (the sponsor itself never sends tokens to the collector).
const SOLANA_FEE_COLLECTOR = "DmVApZ3sSbAdm9mqoMnGxH5RpBHRtEDAZLvKSt9k5MhW";
// Self-signed stablecoin transfers into the Solana collector that are not fees:
const SOLANA_NON_FEE_SENDERS = [
  "fr6yQkDmWy6R6pecbUsxXaw6EvRJznZ2HsK5frQgud8",
  "EbVzVDRCEVw1NFjavcRJ5SDrpSyBWkxLmTEoVycwkM8c",
];

// Fees are only paid in these stablecoins. The EVM collector also receives unsolicited airdrops of memecoins and
// fake tokens, so only these tokens are counted.
const chainConfig: Record<string, { start: string; tokens: string[] }> = {
  [CHAIN.BASE]: { start: "2026-01-30", tokens: [ADDRESSES.base.USDC] },
  [CHAIN.ROBINHOOD]: { start: "2026-07-16", tokens: [ADDRESSES.robinhood.USDG] },
  [CHAIN.SOLANA]: { start: "2025-08-18", tokens: [ADDRESSES.solana.USDC, ADDRESSES.solana.PYUSD] },
};

const fetch = async (options: FetchOptions) => {
  const { tokens } = chainConfig[options.chain];
  const dailyFees = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    const received = await getSolanaReceived({ options, target: SOLANA_FEE_COLLECTOR, mints: tokens, blacklists: SOLANA_NON_FEE_SENDERS });
    dailyFees.addBalances(received, METRIC.TRADING_FEES);
  } else {
    const received = await addTokensReceived({ options, target: EVM_FEE_COLLECTOR, tokens });
    dailyFees.addBalances(received, METRIC.TRADING_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Fees: "Fees True Markets users pay on swaps, and on stablecoin sends and withdrawals, made through the True Markets app, API and agents, counted as the stablecoins received by the True Markets fee collector wallets.",
  UserFees: "Fees users pay to True Markets on swaps and on stablecoin sends and withdrawals.",
  Revenue: "All swap, send and withdrawal fees paid by users, kept by True Markets.",
  ProtocolRevenue: "All swap, send and withdrawal fees paid by users, sent to the True Markets fee collector wallets.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "True Markets fee on each swap (1% on app swaps), plus the fee on stablecoin sends and withdrawals, paid in USDC (Base), USDG (Robinhood Chain) or USDC/PYUSD (Solana) to the True Markets fee collector wallet.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Swap, send and withdrawal fees paid by True Markets users.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Swap, send and withdrawal fees paid by users, kept in full by True Markets.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Swap, send and withdrawal fees paid by users, received by the True Markets fee collector wallets.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
};

export default adapter;
