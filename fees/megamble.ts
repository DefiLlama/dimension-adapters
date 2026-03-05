import { Adapter, FetchOptions } from "../adapters/types"; import { CHAIN } from "../helpers/chains";

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
const CLICK_PRICE = "1000000000000000"; // 0.001 ETH in wei

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();

  const clickLogs = await options.getLogs({
    target: GAME_CONTRACT,
    eventAbi:
      "event Clicked(uint256 indexed round, address indexed player, string username, uint256 clickNumber, uint256 potAfter, bool usedCredit)",
  });

  const gameEndedLogs = await options.getLogs({
    target: GAME_CONTRACT,
    eventAbi:
      "event GameEnded(uint256 indexed round, address indexed winner, string winnerName, uint256 prize, uint256 totalClicks, uint256 totalPot)",
  });

  const totalClicks = clickLogs.length;
  const totalUserSpend = BigInt(totalClicks) * BigInt(CLICK_PRICE);
  dailyUserFees.addGasToken(totalUserSpend);

  let totalFees = BigInt(0);

  const clickFees = (totalUserSpend * BigInt(15)) / BigInt(100);
  totalFees += clickFees;

  for (const log of gameEndedLogs) {
    const protocolCut = (BigInt(log[5]) * BigInt(15)) / BigInt(100);
    totalFees += protocolCut;
  }

  dailyFees.addGasToken(totalFees);
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
      start: 1771459200,
    },
  },
};

export default adapter;

