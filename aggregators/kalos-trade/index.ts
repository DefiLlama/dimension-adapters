import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getKalosTradeFees, KALOS_START } from "../../helpers/kalos";

// Kalos (https://www.kalos.fun) on Kinetiq Elysium: routed volume of its Trade terminal (Sniper) and Swap panel.
// A Kalos trade is identified by the Kalos fee its router (0x's Settler, the Ascend router or the Kalos Universal Router)
// pays to the Kalos revenue splitter in the trade transaction; see helpers/kalos.ts.
// Contracts: https://www.kalos.fun/learn/contracts, fees: https://www.kalos.fun/learn/fees

const ROUTER_LABELS = { zerox: '0x Settler', ascend: 'Ascend Router', kalos: 'Kalos Universal Router' };

/** Routed volume of Kalos trades in the window, one trade per transaction, without trades only on Kalos DEX pools */
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const trades = await getKalosTradeFees(options);
  const counted = new Set<string>();
  for (const trade of trades) {
    // swaps only on Kalos DEX pools are Kalos DEX volume (kalos-dex), not routed volume
    if (trade.kalosPoolsOnly) continue;
    // one trade per transaction: a second fee transfer in the same trade is not a second trade
    if (counted.has(trade.hash)) continue;
    counted.add(trade.hash);
    dailyVolume.add(trade.token, trade.size, ROUTER_LABELS[trade.router]);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  doublecounted: true, // every trade is executed by 0x's Settler or by the launchpad's own pools, which are listed themselves
  chains: [CHAIN.ELYSIUM],
  start: KALOS_START,
  methodology: {
    Volume: "Trades made on the Kalos Trade terminal and Swap panel and routed through 0x's Settler, the Ascend launchpad router or the Kalos Universal Router. A trade is identified by the Kalos fee its router pays to the Kalos revenue splitter in the same transaction, and its size is the amount of the fee token (WHYPE, USDC or the bought token) the router received in that transaction, before the fee. Trades whose swaps were all on Kalos DEX pools are excluded, they are counted as Kalos DEX volume.",
  },
  breakdownMethodology: {
    Volume: {
      '0x Settler': "Kalos trades routed through 0x's Settler (the Settler named by 0x's registry, and the one it replaced).",
      'Ascend Router': 'Kalos trades of Ascend launchpad tokens routed through the Ascend Universal Router.',
      'Kalos Universal Router': 'Kalos Swap panel trades through the Kalos Universal Router that use pools other than Kalos DEX pools.',
    },
  },
};

export default adapter;
