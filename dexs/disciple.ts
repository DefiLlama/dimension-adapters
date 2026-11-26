// DISCIPLE: volume adapter. Coin launchpad on Robinhood Chain (https://disciple.vip, https://x.com/disciplevip).
// Curve phase: gross quote leg of every BondingCurve Trade. Buys: quoteAmt is the gross quote paid. Sells: quoteAmt is
// the net quote received, so the trade fee and any Easy crew tip (ProfitTaxCharged.tax) are added back to get gross.
// Only curve (pre-graduation) volume is counted: once a coin graduates it trades in a Uniswap v4 pool, and that
// volume belongs to the Uniswap v4 listing. Contract discovery is shared with fees/disciple.ts.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getMarkets } from "../fees/disciple";

const TRADE = "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 quoteAmt, uint256 tokenAmt, uint256 fee, uint256 snipeFee, uint256 priceBeforeX18, uint256 priceAfterX18, uint256 impactBps, uint256 mcapAfterUsd)";

const CREW_TIP = "event ProfitTaxCharged(address indexed token, address indexed seller, uint256 tax, uint256 grossQuote, uint256 costBasis)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { curves } = await getMarkets(options);
  const curveList = Object.keys(curves);

  if (curveList.length) {
    const [trades, tips] = await Promise.all([
      options.getLogs({ targets: curveList, eventAbi: TRADE, flatten: false }),
      options.getLogs({ targets: curveList, eventAbi: CREW_TIP, flatten: false }),
    ]);
    trades.forEach((logs: any[], i: number) => {
      const { quote } = curves[curveList[i]];
      for (const t of logs) dailyVolume.add(quote, t.isBuy ? t.quoteAmt : BigInt(t.quoteAmt) + BigInt(t.fee));
      for (const tip of tips[i]) dailyVolume.add(quote, tip.tax);
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
    Volume: "Gross quote-token value (USDG or the coin's pair token) of every trade on DISCIPLE bonding curves. Trades after a coin graduates to its Uniswap v4 pool are left to the Uniswap v4 listing.",
  },
};

export default adapter;
