import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IAmount {
  amountIn: number;
  amountOut: number;
}
const event_swap = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)';
const topic0 = '0xad7d6f97abf51ce18e17a38f4d70e975be9c0708474987bb3e26ad21bd93ca70';

const contract_interface = new ethers.utils.Interface([
  event_swap
]);

type TAddress = {
  [s: string]: string;
}
const FACTORY_ADDRESS: TAddress = {
  [CHAIN.FANTOM]: "0x8597dB3ba8dE6BAAdEDa8cBa4dAC653E24a0e57B"
}

type TABI = {
  [k: string]: object;
}
const ABIs: TABI = {
  getNumberOfLBPairs:   {
    inputs: [],
    name: "getNumberOfLBPairs",
    outputs: [
      { internalType: "uint256", name: "lbPairNumber", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  getLBPairAtIndex:{
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getLBPairAtIndex",
    outputs: [
      { internalType: "contract ILBPair", name: "lbPair", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  }
};

const PAIR_TOKEN_ABI = (token: string): object => {
  return {
    "inputs": [],
    "name": token,
    "outputs": [
        {
            "internalType": "contract IERC20",
            "name": "tokenX",
            "type": "address"
        }
    ],
    "stateMutability": "pure",
    "type": "function"
  }
};


const graph = (chain: Chain) => {
  return async (timestamp: number) => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const poolLength = (await sdk.api.abi.call({
        target: FACTORY_ADDRESS[chain],
        chain: chain,
        abi: ABIs.getNumberOfLBPairs,
      })).output;

      const poolsRes = await sdk.api.abi.multiCall({
        abi: ABIs.getLBPairAtIndex,
        calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
          target: FACTORY_ADDRESS[chain],
          params: i,
        })),
        chain: chain
      });

      const lpTokens = poolsRes.output
        .map(({ output }) => output)

      const [underlyingToken0, underlyingToken1] = await Promise.all(
        ['getTokenX', 'getTokenY'].map((method: string) =>
          sdk.api.abi.multiCall({
            abi: PAIR_TOKEN_ABI(method),
            calls: lpTokens.map((address) => ({
              target: address,
            })),
            chain: chain
          })
        )
      );

      const tokens0 = underlyingToken0.output.map((res) => res.output);
      const tokens1 = underlyingToken1.output.map((res) => res.output);
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.api.util.getLogs({
        target: address,
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic0]
      }))))
        .map((p: any) => p)
        .map((a: any) => a.output);

        const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${chain}:${e}`);
        const coins = [...new Set(rawCoins)]
        const prices = await getPrices(coins, timestamp);


        const untrackVolumes: number[] = lpTokens.map((_: string, index: number) => {
          const token0Decimals = prices[`${chain}:${tokens0[index]}`]?.decimals || 0
          const token1Decimals = prices[`${chain}:${tokens1[index]}`]?.decimals || 0
          const log: IAmount[] = logs[index]
            .map((e: ILog) => { return { ...e } })
            .map((p: ILog) => {
              const a = contract_interface.parseLog(p);
              const amountIn = token0Decimals ? Number(a.args.amountsIn) / 10 ** token0Decimals : 0;
              const amountOut = token1Decimals ? Number(a.args.amountsOut) / 10 ** token1Decimals : 0;
              const amount = Math.min(amountOut, amountIn);
              return {
                amountIn: amount,
                amountOut: amount,
              } as IAmount
            }) as IAmount[];

            const token0Price = (prices[`${chain}:${tokens0[index]}`]?.price || 0);
            const token1Price = (prices[`${chain}:${tokens1[index]}`]?.price || 0);
          const totalAmountIn = log
            .reduce((a: number, b: IAmount) => Number(b.amountIn) + a, 0)  * token0Price;
          const totalAmountOut = log
            .reduce((a: number, b: IAmount) => Number(b.amountOut) + a, 0)  * token1Price;
          const untrackAmountUSD = token0Price !== 0 ? totalAmountIn : token1Price !== 0 ? totalAmountOut : 0; // counted only we have price data
          return untrackAmountUSD;
        });
        const dailyVolume = untrackVolumes.reduce((a: number, b: number) => a + b, 0);
      return {
        dailyVolume: `${dailyVolume}`,
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
    [CHAIN.FANTOM]: {
      fetch: graph(CHAIN.FANTOM),
      start: async () => 1681130577,
    }
  }
};

export default adapter;
