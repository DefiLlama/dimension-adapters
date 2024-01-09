import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers,  } from "ethers";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IAmount {
  amountInX: number;
  amountInY: number;
}
const event_swap = 'event Swap(address indexed sender,address indexed to,uint24 id,bytes32 amountsIn,bytes32 amountsOut,uint24 volatilityAccumulator,bytes32 totalFees,bytes32 protocolFees)';
const topic0 = '0xad7d6f97abf51ce18e17a38f4d70e975be9c0708474987bb3e26ad21bd93ca70';

const contract_interface = new ethers.Interface([
  event_swap
]);

type TPool = {
  [c: string]: string[];
}
const pools: TPool = {
  [CHAIN.BSC]: [
    '0xdce12347b429a32a177708646d4024449827a69a',
    '0x3708d924f627d8109687ce10f6c324445c28347c',
    '0x7e6857d4b2efaf9ff29f88f6d7d083a160e0849e',
  ],
  [CHAIN.AVAX]: [
    '0xd9fa522f5bc6cfa40211944f2c8da785773ad99d',
    '0x4224f6f4c9280509724db2dbac314621e4465c29',
    '0x1901011a39b11271578a1283d620373abed66faa',
    '0xd446eb1660f766d533beceef890df7a69d26f7d1',
    '0x87eb2f90d7d0034571f343fb7429ae22c1bd9f72',
    '0x9b2cc8e6a2bbb56d6be4682891a91b0e48633c72',
    '0x9f8973fb86b35c307324ec31fd81cf565e2f4a63',
    '0xa99f186580d88fec124f8a1bb3f29cc610b66b6b',
    '0xb2a765cbde23b871ffdea95880c8bea979720d36',
    '0xc0dfc065894b20d79aade34a63b5651061b135cc',
    '0x9a0a97d8005d9f783a054aa5cd8878bb0ccf414d',
    '0x51146e0bf2dcc368de6f5201fe7c427da28d05de',
    '0x2f1da4bafd5f2508ec2e2e425036063a374993b6',
    '0x6fe050dc81b98e4464d3b4461a7995a8bf3350db',
    '0x42c701d4e359178412d014506cfac43a67e57d6d',
    '0xe2b11d3002a2e49f1005e212e860f3b3ec73f985',
    '0x16396b65d5e0794c44447396f94665d3b9f576a0',
    '0x7c13d4c3e9dfa683e7a5792a9ff20cb5fd22b0c0',
    '0x6dbcf39c6686a4088a224a18f63f92fe6535f7a8'
  ],
  [CHAIN.ARBITRUM]: [
    '0x94d53be52706a155d27440c4a2434bea772a6f7c',
    '0xee1d31ab646056f549a78feacb73be45332fa078',
    '0x003ad0975250c810ad75fd83e989f54625cac514',
    '0x4b9bfed1dd4e6780454b2b02213788f31ffba74a',
    '0xdf34e7548af638cc37b8923ef1139ea98644735a',
    '0xd387c40a72703b38a5181573724bcaf2ce6038a5',
    '0x0f475257b6e2fa9a48ef84cb4a91d4288729f39e',
    '0xf8a60082039a1acbe43b045f87aa0c5f24a358a4',
    '0xc5a7c9d6653218dccca5633595b8604200f84855',
    '0x60563686ca7b668e4a2d7d31448e5f10456ecaf8'
  ]
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
      const lpTokens = pools[chain]
      const [underlyingToken0, underlyingToken1] = await Promise.all(
        ['getTokenX', 'getTokenY'].map((method: string) =>
          sdk.api2.abi.multiCall({
            abi: PAIR_TOKEN_ABI(method),
            calls: lpTokens.map((address: string) => ({
              target: address,
            })),
            chain: chain
          })
        )
      );

      const tokens0 = underlyingToken0;
      const tokens1 = underlyingToken1;
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const logs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0]
      })))) as ILog[][];

        const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${chain}:${e}`);
        const coins = [...new Set(rawCoins)]
        const prices = await getPrices(coins, timestamp);


        const untrackVolumes: number[] = lpTokens.map((_: string, index: number) => {
          const token0Decimals = prices[`${chain}:${tokens0[index]}`]?.decimals || 0
          const token1Decimals = prices[`${chain}:${tokens1[index]}`]?.decimals || 0
          const log: IAmount[] = logs[index]
            .map((e: ILog) => { return { ...e } })
            .map((p: ILog) => {
              const value = contract_interface.parseLog(p);
              const amountInX = Number('0x'+'0'.repeat(32)+value!.args.amountsIn.replace('0x', '').slice(0, 32)) / 10 ** token1Decimals
              const amountInY = Number('0x'+'0'.repeat(32)+value!.args.amountsIn.replace('0x', '').slice(32, 64)) / 10 ** token0Decimals
              return {
                amountInX,
                amountInY,
              } as IAmount
            }) as IAmount[];

            const token0Price = (prices[`${chain}:${tokens0[index]}`]?.price || 0);
            const token1Price = (prices[`${chain}:${tokens1[index]}`]?.price || 0);
          const totalAmountInX = log
            .reduce((a: number, b: IAmount) => Number(b.amountInX) + a, 0)  * token1Price;
          const totalAmountInY = log
            .reduce((a: number, b: IAmount) => Number(b.amountInY) + a, 0)  * token0Price;
          const untrackAmountUSD = (totalAmountInX + totalAmountInY); // counted only we have price data
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
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: async () => 1682121600,
    },
    [CHAIN.BSC]: {
      fetch: graph(CHAIN.BSC),
      start: async () => 1681084800,
    },
    [CHAIN.AVAX]: {
      fetch: graph(CHAIN.AVAX),
      start: async () => 1682467200,
    },
  }
};

export default adapter;
