import { Chain } from "@defillama/sdk/build/general"
import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { getBlock } from "../helpers/getBlock"
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";

const abis: any = {
  counter: {
    "inputs": [],
    "name": "counter",
    "outputs": [
        {
            "internalType": "int256",
            "name": "",
            "type": "int256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  hypeByIndex: {
    "inputs": [
        {
            "internalType": "uint256",
            "name": "index",
            "type": "uint256"
        }
    ],
    "name": "hypeByIndex",
    "outputs": [
        {
            "internalType": "address",
            "name": "",
            "type": "address"
        },
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  }
}
interface IFeesAmount {
  fees: number;
  amount0: number;
  amount1: number;
}
interface IFees {
  fees: number;
  rev: number;
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

type TAddress = {
  [s: Chain | string]: string;
}


const registy_address_quiswap: TAddress = {
  [CHAIN.POLYGON]: '0xAeC731F69Fa39aD84c7749E913e3bC227427Adfd'
}

const registy_address: TAddress = {
  [CHAIN.ETHEREUM]: '0x31CcDb5bd6322483bebD0787e1DABd1Bf1f14946',
  [CHAIN.ARBITRUM]: '0x66cd859053c458688044d816117d5bdf42a56813',
  [CHAIN.POLYGON]: '0x0Ac4C7b794f3D7e7bF1093A4f179bA792CF15055',
  [CHAIN.OPTIMISM]: '0xF5BFA20F4A77933fEE0C7bB7F39E7642A070d599',
  [CHAIN.BSC]: '0xd4bcFC023736Db5617E5638748E127581d5929bd',
  [CHAIN.CELO]: '0x0F548d7AD1A0CB30D1872b8C18894484d76e1569'
}

const topic0_burn = '0x4606b8a47eb284e8e80929101ece6ab5fe8d4f8735acc56bd0c92ca872f2cfe7';

const PAIR_TOKEN_ABI = (token: string): object => {
  return {
    "constant": true,
    "inputs": [],
    "name": token,
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
};

const fetchFees = (chain: Chain, address: TAddress) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const counter = (await sdk.api.abi.call({
        target: address[chain],
        chain: chain,
        abi: abis.counter,
        params: [],
      })).output;
      const poolsRes = (await sdk.api.abi.multiCall({
        abi: abis.hypeByIndex,
        calls: Array.from(Array(Number(counter)).keys()).map((i) => ({
          target: address[chain],
          params: i,
        })),
        chain: chain
      })).output;
      const pools = poolsRes.map((a: any) => a.output[0])

      const [underlyingToken0, underlyingToken1] = await Promise.all(
        ['token0', 'token1'].map((method) =>
          sdk.api.abi.multiCall({
            abi: PAIR_TOKEN_ABI(method),
            calls: pools.map((address: string) => ({
              target: address,
            })),
            chain: chain
          })
        )
      );
      const tokens0 = underlyingToken0.output.map((res) => res.output);
      const tokens1 = underlyingToken1.output.map((res) => res.output);

      const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${chain}:${e}`);
      const coins = [...new Set(rawCoins)]
      const prices = await getPrices(coins, timestamp);
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));
      const logs: ILog[][] = (await Promise.all(pools.map((address: string) => sdk.api.util.getLogs({
        target: address,
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic0_burn]
      }))))
        .map((p: any) => p)
        .map((a: any) => a.output);
      const untrackVolumes: IFees[] = pools.map((_: string, index: number) => {
          const token0Decimals = prices[`${chain}:${tokens0[index]}`]?.decimals || 0
          const token1Decimals = prices[`${chain}:${tokens1[index]}`]?.decimals || 0
          const log: IFeesAmount[] = logs[index]
            .map((e: ILog) => { return { ...e } })
            .map((p: ILog) => {
              const amount0 = Number('0x' + p.data.replace('0x', '').slice(64, 128)) / 10 ** token0Decimals;
              const amount1 = Number('0x' + p.data.replace('0x', '').slice(128, 192)) / 10 ** token1Decimals
              const fees = Number('0x' + p.data.replace('0x', '').slice(0, 64))
              return {
                amount0: amount0,
                amount1: amount1,
                fees
              } as IFeesAmount
            });

            const token0Price = (prices[`${chain}:${tokens0[index]}`]?.price || 0);
            const token1Price = (prices[`${chain}:${tokens1[index]}`]?.price || 0);
          const amount0 = log
            .reduce((a: number, b: IFeesAmount) => Number(b.amount0) + a, 0)  * token0Price;
            const amount1 = log
            .reduce((a: number, b: IFeesAmount) => Number(b.amount1) + a, 0)  * token1Price;
            const revAmount0 = log
            .reduce((a: number, b: IFeesAmount) => (Number(b.amount0)/b.fees) + a, 0)  * token0Price;
            const revAmount1 = log
            .reduce((a: number, b: IFeesAmount) => (Number(b.amount1)/b.fees) + a, 0)  * token1Price;
          return { fees: (amount0+amount1), rev: (revAmount0+revAmount1) }
        });
        const dailyFees = untrackVolumes.reduce((a: number, b: IFees) => a + b.fees, 0);
        const dailyRevenue = untrackVolumes.reduce((a: number, b: IFees) => a + b.rev, 0);
      return {
        timestamp,
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        dailySupplySideRevenue: `${dailyFees-dailyRevenue}`
      }
    } catch(error) {
      console.error(error);
      throw error;
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM, registy_address),
      start: async () => 1682121600,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM, registy_address),
      start: async () => 1682121600,
    },
    [CHAIN.POLYGON]: {
      fetch: async (timestamp: number) => {
        const fees1 = await fetchFees(CHAIN.POLYGON, registy_address)(timestamp);
        const fees2 = await fetchFees(CHAIN.POLYGON, registy_address_quiswap)(timestamp);
        return {
          dailyFees: `${Number(fees1.dailyFees) + Number(fees2.dailyFees)}`,
          dailyRevenue: `${Number(fees1.dailyRevenue) + Number(fees2.dailyRevenue)}`,
          dailySupplySideRevenue: `${Number(fees1.dailySupplySideRevenue) + Number(fees2.dailySupplySideRevenue)}`,
          timestamp
        }
      },
      start: async () => 1682121600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM, registy_address),
      start: async () => 1682121600,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees(CHAIN.BSC, registy_address),
      start: async () => 1682121600,
    },
    [CHAIN.CELO]: {
      fetch: fetchFees(CHAIN.CELO, registy_address),
      start: async () => 1682121600,
    },
  }
};

export default adapter;
