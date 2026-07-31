import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Round mining and claims; explorer-verified RoarGame source:
// https://robinhoodchain.blockscout.com/address/0xB9E308C0de769aB61089Ef47231f0ff92AE8BF69?tab=contract
const GAME = "0xB9E308C0de769aB61089Ef47231f0ff92AE8BF69";
// User-funded automated mining plans; explorer-verified RoarAutoMiner source:
// https://robinhoodchain.blockscout.com/address/0x451e9b91447bE0abeebD3110b8c372988383f72C?tab=contract
const AUTO_MINER = "0x451e9b91447bE0abeebD3110b8c372988383f72C";
// ROAR staking and reward claims; explorer-verified RoarStaking source:
// https://robinhoodchain.blockscout.com/address/0xAB9E06E60AafE34257315c12717e0b9E5bFa7631?tab=contract
const STAKING = "0xAB9E06E60AafE34257315c12717e0b9E5bFa7631";
// ROAR burial and buybacks; explorer-verified RoarTreasury source:
// https://robinhoodchain.blockscout.com/address/0x809e60F2C2556b5B70A372BCE6F7300f8F216f24?tab=contract
const TREASURY = "0x809e60F2C2556b5B70A372BCE6F7300f8F216f24";

const activityEvents = [
  {
    target: GAME,
    userField: "miner",
    eventAbi:
      "event Deployed(uint256 indexed roundId, address indexed miner, uint256 settlementPerSquare, uint32 mask, uint256 totalSettlement)",
  },
  {
    target: GAME,
    userField: "miner",
    eventAbi:
      "event RoundClaimed(uint256 indexed roundId, address indexed miner, address indexed settlementRecipient, address rewardRecipient, uint256 grossSettlement, uint256 grossReward, uint256 earlyClaimFee, address earlyClaimFeeRecipient, uint256 netReward)",
  },
  {
    target: AUTO_MINER,
    userField: "user",
    eventAbi:
      "event ConfigCreated(address indexed user, uint256 indexed nonce, uint8 strategy, uint32 fixedMask, uint8 squareCount, uint256 settlementPerSquare, uint64 rounds, uint64 expiresAt, bool mayStartRound, uint256 maxExecutionFee, uint256 grossBudget, uint256 remainingBudget)",
  },
  {
    target: AUTO_MINER,
    userField: "user",
    eventAbi: "event ConfigFunded(address indexed user, uint256 amount, uint256 remainingBudget)",
  },
  {
    target: AUTO_MINER,
    userField: "user",
    eventAbi:
      "event ConfigCancelled(address indexed user, address indexed recipient, uint256 refund)",
  },
  {
    target: STAKING,
    userField: "staker",
    eventAbi: "event Staked(address indexed staker, uint256 amount)",
  },
  {
    target: STAKING,
    userField: "staker",
    eventAbi:
      "event Unstaked(address indexed staker, address indexed recipient, uint256 amount)",
  },
  {
    target: STAKING,
    userField: "staker",
    eventAbi:
      "event RewardClaimed(address indexed staker, address indexed recipient, uint256 amount)",
  },
  {
    target: STAKING,
    userField: "staker",
    eventAbi: "event Compounded(address indexed staker, uint256 amount)",
  },
  {
    target: TREASURY,
    userField: "sender",
    eventAbi:
      "event RewardBuried(address indexed sender, uint256 rewardBurned, uint256 rewardShared)",
  },
] as const;

async function fetch(options: FetchOptions) {
  const logsByEvent = await Promise.all(
    activityEvents.map(({ target, eventAbi }) =>
      options.getLogs({ targets: [target], eventAbi, onlyArgs: false })
    )
  );

  const users = new Set<string>();
  const transactions = new Set<string>();

  logsByEvent.forEach((logs, eventIndex) => {
    const { userField } = activityEvents[eventIndex];
    logs.forEach((log: any) => {
      const user = log.args?.[userField];
      if (typeof user === "string") users.add(user.toLowerCase());
      if (typeof log.transactionHash === "string")
        transactions.add(log.transactionHash.toLowerCase());
    });
  });

  return {
    dailyActiveUsers: users.size,
    dailyTransactionsCount: transactions.size,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-30",
  methodology:
    "Counts unique onchain participants in Roar's user-facing economic actions: mining deployments and round claims, funded AutoMiner plan creation/funding/cancellation, staking/unstaking/reward claims/compounding, and voluntary reward burial. Automated keepers and executors, admin settlement claims, configuration-only changes, and bot-triggered lifecycle events are excluded. AutoMiner executions are attributed to the miner through the Game's Deployed event.",
};

export default adapter;
