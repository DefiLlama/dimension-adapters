import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VotingEscrows = {
  USD: "0x0966CAE7338518961c2d35493D3EB481A75bb86B",
  ETH: "0x1Ec2b9a77A7226ACD457954820197F89B3E3a578",
  BTC: "0x7585D9C32Db1528cEAE4770Fd1d01B888F5afA9e"
};

const accountants = Object.values({
  USD: '0x13cCc810DfaA6B71957F2b87060aFE17e6EB8034',
  ETH: '0x61bE1eC20dfE0197c27B80bA0f7fcdb1a6B236E2'
})

const questBoards = [
  '0xA04A36614e4C1Eb8cc0137d6d34eaAc963167828',
  '0xc20824bEd473525bA640f6c2Ae5D89469636DDCb',
  '0xb031DEDb0689059855f45B479BD29c0F964Ec97b',
  '0x85B66887D4Bf9a6116C12A27c91a10F86995C635',
  '0xe0be968a0D6Bba03720DfDB2F3d4b3ED0083b4c7',
  '0x8070117b0C0c72904305b0BD38009409940Caf0c',
]

const QuestBoardABI = {
  quests: "function quests(uint256) view returns (address creator, address rewardToken, address gauge, uint48 duration, uint48 periodStart, uint256 totalRewardAmount, uint256 rewardAmountPerPeriod, uint256 minRewardPerVote, uint256 maxRewardPerVote, uint256 minObjectiveVotes, uint256 maxObjectiveVotes, (uint8 voteType, uint8 rewardsType, uint8 closeType) types)"
}

const getBribe = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyBribesRevenue = createBalances()
  const logs = await getLogs({ targets: questBoards, flatten: false, eventAbi: 'event NewQuest(uint256 indexed questID,address indexed creator,address indexed gauge,address rewardToken,uint48 duration,uint256 startPeriod)' });
  if (!logs || logs.length === 0) return { dailyBribesRevenue };
  const questCalls = logs.map((questBoardLogs, index) => questBoardLogs.map(log => ({
    target: questBoards[index],
    params: log.questID,
  }))).flat();
  const quests = await api.multiCall({ abi: QuestBoardABI.quests, calls: questCalls, permitFailure: true, excludeFailed: true });
  const rewardTokens = quests.map(quest => quest.rewardToken);
  const amounts = quests.map(quest => quest.totalRewardAmount);

  dailyBribesRevenue.add(rewardTokens, amounts);
  return { dailyBribesRevenue }
}

const getFees = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyFees = createBalances();
  const ves = Object.values(VotingEscrows)
  const voters = await api.multiCall({ abi: 'address:voter', calls: ves, permitFailure: true, excludeFailed: true })
  const baseAssets = await api.multiCall({ abi: 'address:baseAsset', calls: voters })

  // Budget event is yield generated from scUSD and scETH: comes from strategies in Ethereum veda vault
  const logs = await getLogs({
    targets: voters,
    flatten: false,
    eventAbi: "event BudgetDeposited(address indexed depositor, uint256 indexed period, uint256 amount)",
  });

  // rings dev: rehypothecation, scUSD is on Beets; Curve, Euler, Silo farming
  const accountantsLogs = await getLogs({
    targets: accountants,
    eventAbi: 'event YieldClaimed(address indexed yieldAsset, uint256 amount)',
  })

  accountantsLogs.forEach(log => {
    dailyFees.add(log.yieldAsset, log.amount)
  })

  logs.forEach((log, i) => {
    const asset = baseAssets[i]
    log.map(i => dailyFees.add(asset, i.amount))
  })
  return { dailyFees };
}

const fetch: any = async (options: FetchOptions) => {
  const [{ dailyFees }, { dailyBribesRevenue }] = await Promise.all([getFees(options), getBribe(options)])
  return { dailyFees, dailyBribesRevenue };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-01-21',
    },
  },
  methodology: {
    Fees: "Yield collected from deposited assets.",
    Revenue: "Yield collected from deposited assets.",
    HoldersRevenue: 'Fees distributed to token holders',
    BridesRevenue: "Rewards are distributed to quest participants",
  }
};

export default adapter;
