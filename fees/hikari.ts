import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const KATANA_TOKEN = "0x7F1f4b4b29f5058fA32CC7a97141b8D7e5ABDC2d";
const hikariPool = "0x2ac7673C3a0370dE512A20464a800fa7C53235C3";
const hikariStaking = "0xeCA16687491B0D748C6246645f56AAE787474f3b";
const AUSD_TOKEN = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
const FLOOR = "0x6573895ef28D3aEd6b84656e2CD870B7e08966b8";
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

const FLOOR_RECEIVED_EVENT = "event FloorYield(uint256 floorYield)";

const fetch = async (options: FetchOptions) => {
  const dailyUserFees = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const stakedLogs = await options.getLogs({
    target: hikariStaking,
    eventAbi: STAKED_EVENT,
  });

  const floorYieldLogs = await options.getLogs({
    target: FLOOR,
    eventAbi: FLOOR_RECEIVED_EVENT,
  });

  const feesLogs = await options.getLogs({
    target: hikariPool,
    eventAbi: FEE_EVENT,
  });

  feesLogs.forEach((feeLog) => {
    if (feeLog.owner === FLOOR) {
      dailyFees.addUSDValue(feeLog.amount0);
    }
  });

  const katanaLogs = await options.getLogs({
    target: hikariStaking,
    eventAbi: KATANA_CLAIMED_EVENT,
  });

  const rewardClaimedLogs = await options.getLogs({
    target: hikariStaking,
    eventAbi: REWARD_CLAIMED_EVENT,
  });

  rewardClaimedLogs.forEach((rewardClaimedLog) => {
    const rewardClaimed = Number(rewardClaimedLog.ausd) / 1e6;
    dailyHoldersRevenue.addUSDValue(rewardClaimed);
  });

  floorYieldLogs.forEach((floorYieldLog) => {
    const floorYield = Number(floorYieldLog.floorYield) / 1e6;
    dailyUserFees.addUSDValue(floorYield);
    dailyFees.addUSDValue(floorYield);
    dailyRevenue.addUSDValue(floorYield);
  });

  katanaLogs.forEach((katanaLog) => {
    const katana = Number(katanaLog.tokens);
    dailyHoldersRevenue.add(KATANA_TOKEN, katana);
    dailyRevenue.add(KATANA_TOKEN, katana);
    dailyFees.add(KATANA_TOKEN, katana);
  });

  return {
    dailyUserFees,
    dailyFees,
    dailyProtocolRevenue: dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Fees collected from the yield collected from the staking contract. In addition, fee collected from the protocol's concentrated liquidity.",
    Revenue: "Revenue collected from fees and yield from the staking contract.",
    UserFees:
      "User fees collected from the staking contract. 70% of the revenue is distributed to floor.",
    HoldersRevenue:
      "Revenue collected from the staking contract. 30% of the revenue is distributed to the holders.",
  },
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.KATANA]: {
      fetch: fetch as any,
      start: "2025-07-08",
    },
  },
};

export default adapter;
