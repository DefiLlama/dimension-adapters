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

const event_swap = 'event SwapERC20(uint256 indexed nonce,address indexed signerWallet,address signerToken,uint256 signerAmount,uint256 protocolFee,address indexed senderWallet,address senderToken,uint256 senderAmount)';
const topic0 = '0xb651f2787ff61b5ab14f3936f2daebdad3d84aeb74438e82870cc3b7aee71e90';

const contract_interface = new ethers.Interface([
  event_swap
]);

type TAddress = {
  [c: string]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0xd82fa167727a4dc6d6f55830a2c47abbb4b3a0f8',
  [CHAIN.POLYGON]: '0xd82fa167727a4dc6d6f55830a2c47abbb4b3a0f8',
  [CHAIN.AVAX]: '0xd82FA167727a4dc6D6F55830A2c47aBbB4b3a0F8',
  [CHAIN.BSC]: '0xd82fa167727a4dc6d6f55830a2c47abbb4b3a0f8',
  [CHAIN.ARBITRUM]: '0xd82FA167727a4dc6D6F55830A2c47aBbB4b3a0F8'
}

const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const logs: ITx[] = (await sdk.getEventLogs({
        target: address[chain],
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0]
      })).map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx});
      const rawData = logs.map((e: ITx) => {
        const data = contract_interface.parseLog(e);
        return {
          signerAmount: Number(data!.args.signerAmount),
          signerToken: data!.args.signerToken,
          protocolFee: Number(data!.args.protocolFee)
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
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: async () => 1689811200,
    },
  }
};

export default adapter;
