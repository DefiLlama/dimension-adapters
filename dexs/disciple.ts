// DISCIPLE: volume adapter. Coin launchpad on Robinhood Chain (https://disciple.vip, https://x.com/disciplevip).
// Curve phase: quote leg of every BondingCurve Trade (buy: gross quote paid, sell: net quote received).
// Only curve (pre-graduation) volume is counted: once a coin graduates it trades in a Uniswap v4 pool, and that
// volume belongs to the Uniswap v4 listing. Contract discovery is shared with fees/disciple.ts.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getMarkets } from "../fees/disciple";

const TRADE = "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 quoteAmt, uint256 tokenAmt, uint256 fee, uint256 snipeFee, uint256 priceBeforeX18, uint256 priceAfterX18, uint256 impactBps, uint256 mcapAfterUsd)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { curves } = await getMarkets(options);
  const curveList = Object.keys(curves);

  if (curveList.length) {
    const trades = await options.getLogs({ targets: curveList, eventAbi: TRADE, flatten: false });
    trades.forEach((logs: any[], i: number) => {
      const { quote } = curves[curveList[i]];
      for (const t of logs) dailyVolume.add(quote, t.quoteAmt);
    });
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-11-20",
  methodology: {
    Volume: "Quote-token value (USDG or the coin's pair token) of every trade on DISCIPLE bonding curves. Trades after a coin graduates to its Uniswap v4 pool are left to the Uniswap v4 listing.",
  },
};

export default adapter;
