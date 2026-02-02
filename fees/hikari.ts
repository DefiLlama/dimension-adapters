import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const KATANA_TOKEN = "0x7F1f4b4b29f5058fA32CC7a97141b8D7e5ABDC2d";
const hikariPool = "0x2ac7673C3a0370dE512A20464a800fa7C53235C3";
const hikariStaking = "0xeCA16687491B0D748C6246645f56AAE787474f3b";

const FEE_EVENT =
  "event Collect(address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)";

const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const STAKED_EVENT =
  "event Staked(address user, uint256 amount, address pool, uint256 time)";

const UNSTAKED_EVENT =
  "event Unstaked(address user, uint256 amount, address pool, uint256 time, uint256 matureTime)";

const REWARD_CLAIMED_EVENT =
  "event RewardClaimed(address user, uint256 ausd, address pool, uint256 time, address ausd_)"; // ausd_ is the reward token for the user

const KATANA_CLAIMED_EVENT =
  "event KatanaClaimed(address sender, address vault, uint256 tokens, uint256 acc)";

const fetch = async (options: FetchOptions) => {
  const dailyUserFees = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const stakedLogs = await options.getLogs({
    target: hikariStaking,
    eventAbi: STAKED_EVENT,
  });

  const katanaLogs = await options.getLogs({
    target: hikariStaking,
    eventAbi: KATANA_CLAIMED_EVENT,
  });

  const feesLogs = await options.getLogs({
    target: hikariPool,
    eventAbi: FEE_EVENT,
  });

  const rewardClaimedLogs = await options.getLogs({
    target: hikariStaking,
    eventAbi: REWARD_CLAIMED_EVENT,
  });

  feesLogs.forEach((feeLog) => {
    dailyRevenue.addUSDValue(feeLog.amount0);
  });

  rewardClaimedLogs.forEach((rewardClaimedLog) => {
    const rewardClaimed = Number(rewardClaimedLog.ausd) / 1e6;
    const totalFees = rewardClaimed / 0.03;
    const userFees = totalFees * 0.7;
    dailyUserFees.addUSDValue(userFees);
    dailyRevenue.addUSDValue(userFees);
  });

  katanaLogs.forEach((katanaLog) => {
    const katana = Number(katanaLog.tokens) / 1e6;
    dailySupplySideRevenue.add(KATANA_TOKEN, katana);
  });

  return {
    dailyUserFees,
    dailyFees,
    dailyProtocolRevenue: dailyUserFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Fees collected from the Hikari pool's Concentrated Liquidity.",
    Revenue: "Revenue collected from the Hikari pool.",
    Volume: "Volume collected from the Hikari pool.",
  },
  version: 2,
  adapter: {
    [CHAIN.KATANA]: {
      fetch: fetch as any,
      start: "2025-07-08",
    },
  },
};

export default adapter;
