import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";

const event_paid_stream = 'event RewardPaid (address indexed _user, address indexed _receiver, uint256 _reward, address indexed _token)';
const event_paid_rdnt = 'event RDNTEntitled (address indexed _receipt, uint256 _amount)';

type TAddress = {
  [c: string]: string;
}
const address_reward: TAddress = {

  [CHAIN.BSC]: '0xe05157aA8D14b8ED1d816D505b3D5DEEB83ca131',
  [CHAIN.ARBITRUM]: '0x18a192dFe0BE1E5E9AA424738FdAd800646283b2',
  [CHAIN.ETHEREUM]: '0x7e6E8aeCCb0508FeD6547C9F3731E8f75C5C2932'
}
const address_rdnt_reward: TAddress = {
  [CHAIN.BSC]: '0x91DD506e1f27f50dd40d0E8634013b1F2393DCa0',
  [CHAIN.ARBITRUM]: '0xD97EbDd4a104e8336760C6350930a96A9A659A66',
  [CHAIN.ETHEREUM]: '0x086295a932d0f91da4e878ec33d4355d196bbc44'

}
const address_rdnt: TAddress = {

  [CHAIN.BSC]: '0xf7de7e8a6bd59ed41a4b5fe50278b3b7f31384df',
  [CHAIN.ARBITRUM]: '0x3082CC23568eA640225c2467653dB90e9250AaA0',
  [CHAIN.ETHEREUM]: '0x137dDB47Ee24EaA998a535Ab00378d6BFa84F893'

}

const graph = (chain: Chain) => {
  return async ({ createBalances, getLogs, api }: FetchOptions) => {
    const dailyFees = createBalances();
    let poolLength = await api.call({ abi: 'uint256:poolLength', target: address_reward[chain], });
    let array = Array.from({ length: poolLength }, (_, index) => index);
    const pools = await api.multiCall({ abi: 'function poolTokenList(uint256) view returns(address)', calls: array, target: address_reward[chain] })    // (await getLogs({
    const rewardContracts = await api.multiCall({ abi: 'function pools(address) view returns ( address asset,  address rToken,  address vdToken,  address rewarder, address receiptToken ,  uint256 maxCap,  uint256 lastActionHandled,  bool isNative,   bool isActive)', calls: pools, target: address_reward[chain] })    // (await getLogs({
    for (const i of rewardContracts) {
      const logs = await getLogs({
        target: i.rewarder,
        eventAbi: event_paid_stream,
      });
      logs.forEach((e: any) => {
        dailyFees.add(e._token, e._reward);
      });
    }

    (await getLogs({
      target: address_rdnt_reward[chain],
      eventAbi: event_paid_rdnt,
    })).map((e: any) => {
      dailyFees.add(address_rdnt[chain], e._amount)
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
  },
  methodology: {
    Fees: 'Staking rewards collected from assets staked on Radiant',
    Revenue: 'Staking rewards collected from assets staked on Radiant',
  }
};

export default adapter;
