import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPfwaLiveFactories } from "../helpers/pfwa-markets";

// PFWA Markets (https://pfwa.fun): prediction markets on Robinhood Chain. Each outcome token holds the ETH paid in for
// it, and the factory holds each market's bonus pot (half of every early-sell penalty), all of which is paid to the
// winning side when the market resolves. Open interest is that ETH for every market not yet resolved, read from the
// factories at the end of the period (getMarket(id).resolved, getOptionEthBalances(id), marketBonusPot(id)).
// Resolved markets are settled: what their winners have not claimed yet is not open interest.
const MARKET_ABI = "function getMarket(uint256) view returns (string name, uint8 marketType, uint256 expirationTime, bool resolved, address creator, uint256 winningOptionIndex, uint256 optionCount)";

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  const factories = await getPfwaLiveFactories(options);
  const counts = await options.api.multiCall({ abi: "uint256:marketCount", calls: factories.map(({ factory }) => factory) });
  for (let i = 0; i < factories.length; i++) {
    const { factory } = factories[i];
    const ids = Array.from({ length: Number(counts[i]) }, (_, id) => id);
    const markets = await options.api.multiCall({ target: factory, abi: MARKET_ABI, calls: ids });
    const open = ids.filter((id) => !markets[id].resolved);
    const [balances, bonusPots] = await Promise.all([
      options.api.multiCall({ target: factory, abi: "function getOptionEthBalances(uint256) view returns (uint256[])", calls: open }),
      options.api.multiCall({ target: factory, abi: "function marketBonusPot(uint256) view returns (uint256)", calls: open }),
    ]);
    balances.forEach((list: string[]) => list.forEach((balance) => openInterestAtEnd.addGasToken(balance)));
    bonusPots.forEach((pot: string) => openInterestAtEnd.addGasToken(pot));
  }
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // open interest is a snapshot: hourly records would be summed into the daily value
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  methodology: {
    OpenInterest: "ETH backing the outcome shares of every PFWA market not yet resolved: the ETH held by each outcome token plus the market's bonus pot, read from the market factories at the end of the period. Resolved markets, including winnings not yet claimed, are excluded.",
  },
};

export default adapter;
