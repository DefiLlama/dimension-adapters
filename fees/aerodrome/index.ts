import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_gauge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, getLogs, createBalances, getToBlock, } = fetchOptions
  const chain = api.chain
  const voter = '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5';
  const dailyBribes = createBalances()
  const logs_gauge_created = (await getLogs({
    target: voter,
    fromBlock: 3200601,
    toBlock: await getToBlock(),
    eventAbi: event_gauge_created,
    cacheInCloud: true,
  }))
  const bribes_contract: string[] = logs_gauge_created.map((e: any) => e.bribeVotingReward.toLowerCase());

  const logs = await getLogs({
    targets: bribes_contract,
    eventAbi: event_notify_reward,
  })
  logs.map((e: any) => {
    dailyBribes.add(e.reward, e.amount)
  })

  return { dailyBribesRevenue: dailyBribes } as any
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetch as any,
      start: '2023-08-28',
    }
  }
}
export default adapters;
