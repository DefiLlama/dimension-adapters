import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CRSH's parimutuel market contracts on Monad. Older addresses are kept for
// historical coverage.
// Current: https://monadscan.com/address/0x8964d7c989bf4b9bbd179ecd205544d3bb5b10f8
// Legacy: https://monadscan.com/address/0x968279784d780c02a79b1c58ad69aaa832f09342
// Legacy: https://monadscan.com/address/0x7b9256fd345b6dfa78017094cae64b153de21fb2
const MARKET_CONTRACTS = [
  "0x8964d7C989bF4B9bbd179ecd205544d3bb5B10F8",
  "0x968279784d780c02a79b1c58ad69aaa832f09342",
  "0x7b9256fd345b6dFa78017094caE64B153dE21fb2",
];
// USDC (6 decimals): https://monadscan.com/token/0x754704bc059f8c67012fed69bc8a327a5aafb603
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";

const BET_PLACED_EVENT =
  "event BetPlaced(uint256 indexed marketId, address indexed user, uint8 option, uint256 amount, uint256 weightBps, uint256 weightedAmount, uint256 impactAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    targets: MARKET_CONTRACTS,
    eventAbi: BET_PLACED_EVENT,
  });

  for (const log of logs) dailyVolume.add(USDC, log.amount);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MONAD],
  start: "2026-07-31",
  methodology: {
    Volume:
      "USDC entry amounts from BetPlaced events emitted by CRSH's current and legacy parimutuel market contracts on Monad. Each bet is counted once; treasury seed liquidity is excluded.",
  },
};

export default adapter;
