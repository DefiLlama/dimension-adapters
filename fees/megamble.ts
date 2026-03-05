import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Megamble - Fully on-chain competitive game on MegaETH
 *
 * Fee structure per click (0.001 ETH):
 *   - 85% goes to the pot (returned to winner)
 *   - 15% is protocol fee (accumulatedFees)
 *
 * When game ends, pot distribution:
 *   - 85% to the winner
 *   - 15% to protocol treasury
 *
 * Events used:
 *   Clicked(uint256 indexed round, address indexed player, string username,
 *           uint256 clickNumber, uint256 potAfter, bool usedCredit)
 *   GameEnded(uint256 indexed round, address indexed winner, string winnerName,
 *             uint256 prize, uint256 totalClicks, uint256 totalPot)
 */

const GAME_CONTRACT = "0x051B5a8B20F3e49E073Cf7A37F4fE2e5117Af3b6";
const CLICK_PRICE = 1e15; // 0.001 ETH in wei

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();

  // Get all Clicked events for the period
  const clickLogs = await options.getLogs({
    target: GAME_CONTRACT,
    eventAbi:
      "event Clicked(uint256 indexed round, address indexed player, string username, uint256 clickNumber, uint256 potAfter, bool usedCredit)",
  });

  // Get all GameEnded events for the period
  const gameEndedLogs = await options.getLogs({
    target: GAME_CONTRACT,
    eventAbi:
      "event GameEnded(uint256 indexed round, address indexed winner, string winnerName, uint256 prize, uint256 totalClicks, uint256 totalPot)",
  });

  // dailyUserFees = total ETH spent by users (clicks x 0.001 ETH)
  const totalClicks = clickLogs.length;
  const totalUserSpend = BigInt(totalClicks) * BigInt(CLICK_PRICE);
  dailyUserFees.addGasToken(totalUserSpend);

  // dailyFees = 15% of each click + 15% of each pot at game end
  let totalFees = BigInt(0);

  // Fee per click: 15% of 0.001 ETH
  const clickFees = (totalUserSpend * BigInt(15)) / BigInt(100);
  totalFees += clickFees;

  // Fee per game end: 15% of totalPot goes to protocol
  for (const log of gameEndedLogs) {
    const totalPot = log.totalPot;
    const protocolCut = (BigInt(totalPot) * BigInt(15)) / BigInt(100);
    totalFees += protocolCut;
  }

  dailyFees.addGasToken(totalFees);

  // dailyRevenue = same as dailyFees (all fees go to protocol treasury)
  dailyRevenue.addGasToken(totalFees);

  return {
    dailyFees,
    dailyRevenue,
    dailyUserFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: 1739952466, // Feb 19, 2026 - contract deployment
      meta: {
        methodology: {
          dailyFees:
            "15% protocol fee on each click (0.001 ETH per click) plus 15% protocol cut from each pot when a game ends.",
          dailyRevenue:
            "All protocol fees (click fees + pot cuts) go to the treasury for monthly USDm distributions.",
          dailyUserFees:
            "Total ETH spent by players clicking (number of clicks x 0.001 ETH per click).",
        },
      },
    },
  },
};

export default adapter;
