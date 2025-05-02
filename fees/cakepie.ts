import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const event_paid_stream = 'event V3PoolFeesPaidTo  (address indexed _user, uint256 _positionId, address _token, uint256 _feeAmount)';
const event_paid_bribe = 'event NewBribe ( address indexed _user, uint256 indexed _targetTime, address _pool, address _bribeToken, uint256 _amount)';

type TAddress = {
  [c: string]: string;
}
const address_reward: TAddress = {

  [CHAIN.BSC]: '0xb47b790076050423888cde9EBB2D5Cb86544F327',
  [CHAIN.ARBITRUM]: '0x6DB96BBEB081d2a85E0954C252f2c1dC108b3f81',
  [CHAIN.ETHEREUM]: '0x6E799758CEE75DAe3d84e09D40dc416eCf713652'
}

const address_bribe: TAddress = {
  [CHAIN.BSC]: '0xD521BF2Fd3c625101feAE9717351EF1E1E702dDF',
  [CHAIN.ARBITRUM]: '0xA08d8e0aEe5929BcD6D72323A2EaCde4Cc951b71',
  [CHAIN.ETHEREUM]: '0xa346Bd80943Aa3042E6709d80Ce9C3b8fbeAc4Ab'
}

//cake emissions and vote incentives for pools are the revenue
const graph = (chain: Chain) => {
  return async ({ createBalances, getLogs, }: FetchOptions) => {
    const dailyFees = createBalances();
    if (chain == 'BSC') {
      (await getLogs({
        target: address_reward[chain],
        eventAbi: event_paid_stream,
      })).map((e: any) => {
        // check if it is cake address
        if (e.token === '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82') {
          dailyFees.add(e._token, e._feeAmount);
        }
      })
    }
    (await getLogs({
      target: address_bribe[chain],
      eventAbi: event_paid_bribe,
    })).map((e: any) => {
      dailyFees.add(e._bribeToken, e._amount)
    })
    return { dailyFees, dailyRevenue: dailyFees, dailyUserFees: dailyFees };
  }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {

    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
    },
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
    },
  }
};

export default adapter;
