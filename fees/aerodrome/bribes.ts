import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions } from '../../adapters/types';

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';

const gurar = '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b';

const abis: any = {
  "all": "function all(uint256 _limit, uint256 _offset, address _account) view returns ((address lp, string symbol, uint8 decimals, bool stable, uint256 total_supply, address token0, uint256 reserve0, uint256 claimable0, address token1, uint256 reserve1, uint256 claimable1, address gauge, uint256 gauge_total_supply, bool gauge_alive, address fee, address bribe, address factory, uint256 emissions, address emissions_token, uint256 account_balance, uint256 account_earned, uint256 account_staked, uint256 pool_fee, uint256 token0_fees, uint256 token1_fees)[])"
}

export const fees_bribes = async ({ getLogs, api, createBalances }: FetchOptions)=> {
  const dailyFees = createBalances()
  const bribeVotingReward: string[] = (await api.call({
    target: gurar,
    params: [1000, 0, ADDRESSES.null],
    abi: abis.all,
  })).map((e: any) => {
    return e.bribe;
  }).filter((e: string) => e !== ADDRESSES.null);
  const bribe_contracct = [...new Set(bribeVotingReward)];
  const logs = await getLogs({
    targets: bribe_contracct,
    eventAbi: event_notify_reward,
  })
  logs.map((e: any) => {
    dailyFees.add(e.reward, e.amount)
  })
  return dailyFees;
}
