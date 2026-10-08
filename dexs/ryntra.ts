import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { TRADING_START, ryntraTrades, tradeSize } from "../helpers/ryntra";

// Volume of the trades made through Ryntra (https://ryntra.io), a trading app: the same transactions
// fees/ryntra.ts counts the fees of. Every one is routed through a venue that already lists it (Jupiter and the
// pools it crosses, Meteora), so the volume is double counted.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const { trade, tx } of await ryntraTrades(options.startTimestamp, options.endTimestamp)) {
    // A trade on the bonding curve of a token launched with Ryntra is Ryntra Launch's volume (dexs/ryntra-launch).
    if (trade.onLaunchCurve) continue;
    const size = tradeSize(trade, tx);
    if (size) dailyVolume.add(size.mint, size.amount);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Ryntra's fee accounts see a few dozen transactions a day, so each hour is read straight from the chain.
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: new Date(TRADING_START * 1000).toISOString().slice(0, 10),
  doublecounted: true,
  methodology: {
    Volume: "One side of every trade made through Ryntra, from the trade's own transaction: the stablecoin the person paid or received, else the SOL, else the token they paid. A trade is Ryntra's when it paid Ryntra's fee inside it (see fees/ryntra). Trades on the bonding curves of tokens launched with Ryntra are counted under Ryntra Launch. Double counted: the venues the trades are routed through already list this volume.",
  },
};

export default adapter;
