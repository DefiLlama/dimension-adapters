import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
const ADDRESSES = require('../helpers/coreAssets.json')

const event_paid_stream = 'event RewardPaidTo (address _market, address _to, address _rewardToken, uint256 _feeAmount)';
const event_paid_bribe = 'event RewardClaimed (address indexed token, address indexed account, uint256 amount, uint256 updateCount)';
const event_pendle_fee= 'event RUpdateProtocolClaimable ( address indexed user, uint256 sumTopUp)';

type TAddress = {
  [c: string]: string;
}
const address_reward: TAddress = {

  [CHAIN.BSC]: '0x782D9D67FeaA4d1CDF8222D9053c8CBA1c3B7982',
  [CHAIN.ARBITRUM]: '0x6DB96BBEB081d2a85E0954C252f2c1dC108b3f81',
  [CHAIN.ETHEREUM]: '0x6E799758CEE75DAe3d84e09D40dc416eCf713652'
}
const reward_eth_pendle='0x8C237520a8E14D658170A633D96F8e80764433b9'
const address_bribe: TAddress = {
  [CHAIN.BSC]: '0x6E796bCF2B63b070F9cC0a7D3d857FeF628E9e5b',
  [CHAIN.ARBITRUM]: '0x8CE523cf1120d9B7703806c745B69663a2847504',
  [CHAIN.ETHEREUM]: '0xa346Bd80943Aa3042E6709d80Ce9C3b8fbeAc4Ab'
}
//all revenue is from bribes and is given to governance token holders 100%

const graph = (chain: Chain) => {
  return async ({ createBalances, getLogs, getFromBlock, getToBlock }: FetchOptions) => {
    const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])
    const dailyFees = createBalances();
    if (chain=='ETHEREUM'){
      (await getLogs({
        target:reward_eth_pendle ,
        eventAbi: event_pendle_fee,
        fromBlock, 
        toBlock
      })).map((e: any) => {
        // check if it is penpie 
          if (e.user === '0x6e799758cee75dae3d84e09d40dc416ecf713652') {
              dailyFees.add(ADDRESSES.null, e.sumTopUp);
            }
      })
    }
    (await getLogs({
      target: address_reward[chain],
      eventAbi: event_paid_stream,
      fromBlock, 
      toBlock
    })).map((e: any) => {
      dailyFees.add(e._rewardToken, e._feeAmount)     
    }),
    (await getLogs({
      target: address_bribe[chain],
      eventAbi: event_paid_bribe,
      fromBlock, 
      toBlock
    })).map((e: any) => {
      dailyFees.add(e.token, e.amount)     
    })
    return { dailyFees, dailyRevenue: dailyFees,dailyUserFees:dailyFees  };
  }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {

    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: 77678653,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: 77678653,
    },
    [CHAIN.ETHEREUM]: {
        fetch: graph(CHAIN.ETHEREUM),
        start: 77678653,
      },
  }
};

export default adapter;
