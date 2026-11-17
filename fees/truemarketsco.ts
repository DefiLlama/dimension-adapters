import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";

// True Markets (https://truemarkets.co, https://x.com/truemarketsco): non-custodial trading app, API and agents for
// tokenized stocks and crypto. Swaps are routed through 0x / KyberSwap on Base and Robinhood Chain and Jupiter on
// Solana; the True Markets fee is taken in the trade's stablecoin inside the same user operation / transaction and
// sent to the fee collector wallets below (confirmed by True Markets).
// Hyperliquid builder-code fees are tracked separately in factory/hyperliquid.ts (truemarketsco-perps / -spot).

// Same fee collector on Base and Robinhood Chain.
// https://base.blockscout.com/address/0x62f00D95FFE2071F0EbdCf898Caa384DDCEC71C5
// https://robinhoodchain.blockscout.com/address/0x62f00D95FFE2071F0EbdCf898Caa384DDCEC71C5
const EVM_FEE_COLLECTOR = "0x62f00D95FFE2071F0EbdCf898Caa384DDCEC71C5";
// https://solscan.io/account/DmVApZ3sSbAdm9mqoMnGxH5RpBHRtEDAZLvKSt9k5MhW
const SOLANA_FEE_COLLECTOR = "DmVApZ3sSbAdm9mqoMnGxH5RpBHRtEDAZLvKSt9k5MhW";
// Gas sponsor that funds and signs for the Solana wallet; its SOL top-ups are not fees.
const SOLANA_GAS_SPONSOR = "A93NGHwpaa5xB7kzuiWqhCzZjtdhNFa8g4gduk3wvdXy";

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
    const received = await getSolanaReceived({ options, target: SOLANA_FEE_COLLECTOR, mints: tokens, blacklists: [SOLANA_GAS_SPONSOR] });
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
  Fees: "Trading fees True Markets users pay on swaps placed through the True Markets app, API and agents, counted as the stablecoins received by the True Markets fee collector wallets.",
  UserFees: "All trading fees are paid by users.",
  Revenue: "All trading fees are kept by True Markets.",
  ProtocolRevenue: "All trading fees are kept by True Markets.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "True Markets fee on each swap, sent in USDC (Base), USDG (Robinhood Chain) or USDC/PYUSD (Solana) to the True Markets fee collector wallet.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Same as the Fees component.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Same as the Fees component.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Same as the Fees component.",
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
