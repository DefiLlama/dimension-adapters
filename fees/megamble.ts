import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * Megamble - Fully on-chain competitive game on MegaETH
 *
 * Fee structure per click (0.001 ETH):
 *   - 85% goes to the pot (winner takes all)
 *   - 10% goes to treasury (protocol revenue)
 *   - 5% goes to referrer (supply side revenue)
 *
 * Events used:
 *   Clicked(uint256 indexed round, address indexed player, string username,
 *           uint256 clickNumber, uint256 potAfter, bool usedCredit)
 */

const GAME_CONTRACT = "0x051B5a8B20F3e49E073Cf7A37F4fE2e5117Af3b6";
const CLICK_PRICE = "1000000000000000"; // 0.001 ETH in wei

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const clickLogs = await options.getLogs({
    target: GAME_CONTRACT,
    eventAbi:
      "event Clicked(uint256 indexed round, address indexed player, string username, uint256 clickNumber, uint256 potAfter, bool usedCredit)",
  });

  const totalClicks = clickLogs.length;
  const totalSpend = BigInt(totalClicks) * BigInt(CLICK_PRICE);

  // dailyFees = 15% of all clicks (10% treasury + 5% referral)
  const totalFeesAmount = (totalSpend * BigInt(15)) / BigInt(100);
  dailyFees.addGasToken(totalFeesAmount);

  // dailyRevenue = 10% treasury (protocol revenue)
  const treasuryAmount = (totalSpend * BigInt(10)) / BigInt(100);
  dailyRevenue.addGasToken(treasuryAmount);

  // dailySupplySideRevenue = 5% referral earnings
  const referralAmount = (totalSpend * BigInt(5)) / BigInt(100);
  dailySupplySideRevenue.addGasToken(referralAmount);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "15% of the pot amount is charged as fees , 85% to winner",
  Revenue: "10% of the pot amount is revenue",
  ProtocolRevenue: "10% of the pot amount is protocol revenue",
  SupplySideRevenue: "5% of the pot amount goes to the referrer",
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-19",
  methodology,
};

export default adapter;
