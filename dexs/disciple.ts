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
    curveList.forEach((curve, i) => {
      const { quote } = curves[curve];
      // sells report the net quote received, so the fee and crew tip are added back to get gross
      for (const t of trades[i]) dailyVolume.add(quote, t.isBuy ? t.quoteAmt : BigInt(t.quoteAmt) + BigInt(t.fee));
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
