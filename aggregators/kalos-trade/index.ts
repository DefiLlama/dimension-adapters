import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getKalosTradeFees, KALOS_START, kalosReferralExclusion } from "../../helpers/kalos";

// Kalos (https://www.kalos.fun) on Kinetiq Elysium: routed volume of its Trade terminal (Sniper) and Swap panel, and the
// Kalos fee on those trades, 1% on the Trade terminal and on launchpad tokens, 0.2% on other Swap panel trades.
// A Kalos trade is identified by the Kalos fee its router (0x's Settler, the Ascend router or the Kalos Universal Router)
// pays to the Kalos revenue splitter in the trade transaction; see helpers/kalos.ts.
// Contracts: https://www.kalos.fun/learn/contracts, fees: https://www.kalos.fun/learn/fees

const LABELS = {
  TRADING: METRIC.TRADING_FEES,
  TRADING_PROTOCOL: 'Trading Fees To Protocol',
};

/**
 * Routed volume of Kalos trades in the window, one trade per transaction, without trades only on Kalos DEX pools, and the
 * Kalos fees the routers of all Kalos trades paid to the revenue splitter
 */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const trades = await getKalosTradeFees(options);
  const counted = new Set<string>();
  for (const trade of trades) {
    // the Kalos fee is paid on every Kalos trade, including those only on Kalos DEX pools
    dailyFees.add(trade.token, trade.fee, LABELS.TRADING);
    dailyRevenue.add(trade.token, trade.fee, LABELS.TRADING_PROTOCOL);
    // swaps only on Kalos DEX pools are Kalos DEX volume (kalos-dex), not routed volume
    if (trade.kalosPoolsOnly) continue;
    // one trade per transaction: a second fee transfer in the same trade is not a second trade
    if (counted.has(trade.hash)) continue;
    counted.add(trade.hash);
    dailyVolume.add(trade.token, trade.size);
  }
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const FEE_RATES = '1% on Trade terminal trades and launchpad tokens, 0.2% on other Swap panel trades';
const REFERRAL_EXCLUSION = kalosReferralExclusion('Kalos Trade');

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  doublecounted: true, // every trade is executed by 0x's Settler or by the launchpad's own pools, which are listed themselves
  chains: [CHAIN.ELYSIUM],
  start: KALOS_START,
  methodology: {
    Volume: "Value of swaps made on the Kalos Trade terminal and Swap panel, executed through 0x, the Ascend launchpad or Kalos's own swap router. Excludes swaps filled only on Kalos DEX pools, which are counted under Kalos DEX.",
    Fees: `Trading fees paid by users on Kalos Trade terminal and Swap panel swaps (${FEE_RATES}).`,
    UserFees: `Trading fees paid by users on Kalos Trade terminal and Swap panel swaps (${FEE_RATES}).`,
    Revenue: `All trading fees paid by users on Kalos Trade terminal and Swap panel swaps, kept by Kalos. ${REFERRAL_EXCLUSION}`,
    ProtocolRevenue: `All trading fees paid by users on Kalos Trade terminal and Swap panel swaps, sent to Kalos's own vaults and referral pool. ${REFERRAL_EXCLUSION}`,
  },
  breakdownMethodology: {
    Fees: { [LABELS.TRADING]: `Kalos fee on Trade terminal and Swap panel swaps (${FEE_RATES}).` },
    UserFees: { [LABELS.TRADING]: `Kalos fee on Trade terminal and Swap panel swaps (${FEE_RATES}), paid by users.` },
    Revenue: { [LABELS.TRADING_PROTOCOL]: 'All Kalos trading fees, kept by Kalos.' },
    ProtocolRevenue: { [LABELS.TRADING_PROTOCOL]: "All Kalos trading fees, sent to Kalos's own vaults and referral pool." },
  },
};

export default adapter;
