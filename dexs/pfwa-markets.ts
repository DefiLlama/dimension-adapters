import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPfwaMarketTrades } from "../helpers/pfwa-markets";

// PFWA Markets (https://pfwa.fun): prediction markets on Robinhood Chain where every outcome is its own bonding-curve
// token, bought and sold with native ETH. Contracts, events and the excluded protocol wallets: helpers/pfwa-markets.ts
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { buys, sells } = await getPfwaMarketTrades(options);
  // a buy pays the curve cost (TokensBought.ethPaid) plus the creator and protocol fees on top of it
  for (const buy of buys) dailyVolume.addGasToken(buy.ethPaid + buy.creatorFee + buy.platformFee);
  // a sell's TokensSold.ethReceived is the curve proceeds before the sell fee or early-sell penalty is taken
  for (const sell of sells) dailyVolume.addGasToken(sell.ethReceived);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  methodology: {
    Volume: "ETH value of every buy and sell of an outcome token on PFWA Markets, gross of fees (a buy counts what the trader paid including fees, a sell what the curve paid out before the sell fee). Claims of winnings after a market resolves are not trades and are excluded, as are trades by PFWA's own wallets (team, market seeder, market-making agent).",
  },
};

export default adapter;
