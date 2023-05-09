import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers,  } from "ethers";

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IData  {
  signerAmount: number;
  signerToken: string;
  protocolFee: number;
}

const event_swap = 'event Swap(uint256 indexed nonce,uint256 timestamp,address indexed signerWallet,address signerToken,uint256 signerAmount,uint256 protocolFee,address indexed senderWallet,address senderToken,uint256 senderAmount)';
const topic0 = '0x06dfeb25e76d44e08965b639a9d9307df8e1c3dbe2a6364194895e9c3992f033';

const contract_interface = new ethers.utils.Interface([
  event_swap
]);

type TAddress = {
  [c: string]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x522d6f36c95a1b6509a14272c17747bbb582f2a6',
  [CHAIN.POLYGON]: '0x6713C23261c8A9B7D84Dd6114E78d9a7B9863C1a',
  [CHAIN.AVAX]: '0xEc08261ac8b3D2164d236bD499def9f82ba9d13F',
  [CHAIN.BSC]: '0x132F13C3896eAB218762B9e46F55C9c478905849'
}

const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const logs: ITx[] = (await sdk.api.util.getLogs({
        target: address[chain],
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic0]
      })).output.map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx});
      const rawData = logs.map((e: ITx) => {
        const data = contract_interface.parseLog(e);
        return {
          signerAmount: Number(data.args.signerAmount._hex),
          signerToken: data.args.signerToken,
          protocolFee: Number(data.args.protocolFee._hex)
        }
      })
        const rawCoins = rawData.map((e: IData) => `${chain}:${e.signerToken.toLowerCase()}`);
        const coins = [...new Set(rawCoins)]
        const prices = await getPrices(coins, timestamp);
        const feesAmount: number[] =  rawData.map((e: IData) => {
          const decimals = prices[`${chain}:${e.signerToken.toLowerCase()}`].decimals;
          const price = prices[`${chain}:${e.signerToken.toLowerCase()}`].price;
          return ((Number(e.signerAmount) / 10 ** decimals) * (e.protocolFee / 10000)) * price;
        });

        const dailyFees = feesAmount.reduce((a: number, b: number) => a + b, 0);
        return {
          dailyFees: `${dailyFees}`,
          dailyRevenue: `${dailyFees}`,
          timestamp,
        };
    } catch(error) {
      console.error(error);
      throw error;
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: async () => 1680307200,
    },
    [CHAIN.POLYGON]: {
      fetch: graph(CHAIN.POLYGON),
      start: async () => 1680307200,
    },
    [CHAIN.AVAX]: {
      fetch: graph(CHAIN.AVAX),
      start: async () => 1680307200,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: async () => 1680307200,
    },
  }
};

export default adapter;
