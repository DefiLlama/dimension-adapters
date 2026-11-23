import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPfwaLiveFactories } from "../helpers/pfwa-markets";

// PFWA Markets (https://pfwa.fun): prediction markets on Robinhood Chain. Each outcome token holds the ETH paid in for
// it, which is paid to the winning side when the market resolves. Open interest is that ETH for every market not yet
// resolved, read from the factories at the end of the period (getMarket(id).resolved, getOptionEthBalances(id)).
// Each market's bonus pot (marketBonusPot(id), half of every early-sell penalty) is left out: it is penalty money, not a
// position anyone holds, and is already counted in fees as "Early Sell Penalties To Winners".
// Resolved markets are settled: what their winners have not claimed yet is not open interest.
const MARKET_ABI = "function getMarket(uint256) view returns (string name, uint8 marketType, uint256 expirationTime, bool resolved, address creator, uint256 winningOptionIndex, uint256 optionCount)";

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  const factories = getPfwaLiveFactories(options);
  const counts = await options.api.multiCall({ abi: "uint256:marketCount", calls: factories.map(({ factory }) => factory) });
  const calls = factories.flatMap(({ factory }, i) => Array.from({ length: Number(counts[i]) }, (_, id) => ({ target: factory, params: [id] })));
  const markets = await options.api.multiCall({ abi: MARKET_ABI, calls });
  const open = calls.filter((_, i) => !markets[i].resolved);
  const balances = await options.api.multiCall({ abi: "function getOptionEthBalances(uint256) view returns (uint256[])", calls: open });
  balances.forEach((list: string[]) => list.forEach((balance) => openInterestAtEnd.addGasToken(balance)));
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // open interest is a snapshot: hourly records would be summed into the daily value
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-31",
  methodology: {
    OpenInterest: "ETH backing the outcome shares of every PFWA market not yet resolved: the ETH held by each outcome token, read from the market factories at the end of the period. Excludes each market's bonus pot (the winners' half of early-sell penalties, counted in fees) and resolved markets, including winnings not yet claimed.",
  },
};

export default adapter;
