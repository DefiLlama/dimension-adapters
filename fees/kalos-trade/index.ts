import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getKalosTradeFees, KALOS_START } from "../../aggregators/kalos-trade";

// Kalos Trade (https://www.kalos.fun) on Kinetiq Elysium: the Kalos fee on Trade terminal (Sniper) and Swap panel trades,
// 1% on the Trade terminal and on launchpad tokens, 0.2% on other Swap panel trades (https://www.kalos.fun/learn/fees).
// The router executing the trade (0x's Settler, the Ascend router or the Kalos Universal Router) pays it to the Kalos
// revenue splitter inside the trade transaction; see aggregators/kalos-trade for how those transfers are found.

const LABELS = {
  TRADING: METRIC.TRADING_FEES,
  TRADING_PROTOCOL: 'Trading Fees To Protocol',
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const trades = await getKalosTradeFees(options);
  for (const trade of trades) {
    dailyFees.add(trade.token, trade.fee, LABELS.TRADING);
    dailyRevenue.add(trade.token, trade.fee, LABELS.TRADING_PROTOCOL);
  }
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const description = "The Kalos fee on Trade terminal and Swap panel trades (1% on the Trade terminal and on launchpad tokens, 0.2% on other swaps), paid by the router (0x's Settler, the Ascend router or the Kalos Universal Router) to the Kalos revenue splitter in the trade transaction. It is taken in WHYPE or USDC when one side of the trade is HYPE, WHYPE or USDC, otherwise in the bought token.";

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: KALOS_START,
  methodology: {
    Fees: description,
    UserFees: description,
    Revenue: 'All trade fees are paid to the Kalos revenue splitter.',
    ProtocolRevenue: 'All trade fees are paid to the Kalos revenue splitter, which pays them to the Kalos vaults and the KalosReferralPool (referral rewards are not deducted).',
  },
  breakdownMethodology: {
    Fees: { [LABELS.TRADING]: description },
    UserFees: { [LABELS.TRADING]: description },
    Revenue: { [LABELS.TRADING_PROTOCOL]: 'Trade fees paid to the Kalos revenue splitter.' },
    ProtocolRevenue: { [LABELS.TRADING_PROTOCOL]: 'Trade fees paid to the Kalos revenue splitter.' },
  },
};

export default adapter;
