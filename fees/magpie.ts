import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";

const event_paid_stream = 'event RewardPaid (address indexed _user,address indexed _receiver,uint256 _reward,address indexed _rewardToken)';
const event_paid_base = 'event RewardPaid (address indexed _user,address indexed _receiver,uint256 _reward,address indexed _token)';

type TAddress = {
  [c: string]: string;
}
const address_stream: TAddress = {

  [CHAIN.BSC]: '0x924786bb8d6888bE49E5c27E6E2Df71D6077A2D3',
  [CHAIN.ARBITRUM]: '0x2B5D9ADea07B590b638FFc165792b2C610EdA649'
}

const address_base: TAddress = {
  [CHAIN.BSC]: '0x94Eb0E6800F10E22550e104EC04f98F043B6b3ad',
  [CHAIN.ARBITRUM]: '0x4E47d553FD423316094aBB07E42970A689E1f5f7'
}
//all revenue is from bribes and is given to governance token holders 100%

const graph = (chain: Chain) => {
  return async ({ createBalances, getLogs, }: FetchOptions) => {
    const dailyFees = createBalances();
    (await getLogs({
      target: address_stream[chain],
      eventAbi: event_paid_stream,
    })).map((e: any) => {
      dailyFees.add(e._rewardToken, e._reward)     
    }),
    (await getLogs({
      target: address_base[chain],
      eventAbi: event_paid_base,
    })).map((e: any) => {
      dailyFees.add(e._token, e._reward)     
    })
    return { dailyFees, dailyRevenue: dailyFees,dailyUserFees:dailyFees  };
  }
}

const methodology = {
    Fees: 'Staking rewards collected from assets staked on Wombat Exchange',
    Revenue: 'Staking rewards collected from assets staked on Wombat Exchange',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {

    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
    },
  }
};

export default adapter;
