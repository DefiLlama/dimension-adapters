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
  quests: {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"quests","outputs":[{"internalType":"address","name":"creator","type":"address"},{"internalType":"address","name":"rewardToken","type":"address"},{"internalType":"address","name":"gauge","type":"address"},{"internalType":"uint48","name":"duration","type":"uint48"},{"internalType":"uint48","name":"periodStart","type":"uint48"},{"internalType":"uint256","name":"totalRewardAmount","type":"uint256"},{"internalType":"uint256","name":"rewardAmountPerPeriod","type":"uint256"},{"internalType":"uint256","name":"minRewardPerVote","type":"uint256"},{"internalType":"uint256","name":"maxRewardPerVote","type":"uint256"},{"internalType":"uint256","name":"minObjectiveVotes","type":"uint256"},{"internalType":"uint256","name":"maxObjectiveVotes","type":"uint256"},{"components":[{"internalType":"enum QuestDataTypes.QuestVoteType","name":"voteType","type":"uint8"},{"internalType":"enum QuestDataTypes.QuestRewardsType","name":"rewardsType","type":"uint8"},{"internalType":"enum QuestDataTypes.QuestCloseType","name":"closeType","type":"uint8"}],"internalType":"struct IQuestBoard.QuestTypes","name":"types","type":"tuple"}],"stateMutability":"view","type":"function"}
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
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-01-21',
    },
  },
};

export default adapter;
