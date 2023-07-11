import { Chain } from "@defillama/sdk/build/general";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers  } from "ethers";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";

//
const factory = '0x5f1dddbf348ac2fbe22a163e30f99f9ece3dd50a';
const topic0_pool_created = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
const topic0_swap = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const event_pool_created = 'event PoolCreated(address indexed token0,address indexed token1,uint24 indexed swapFeeUnits,int24 tickDistance,address pool)';
const event_swap = 'event Swap(address indexed sender,address indexed recipient,int256 deltaQty0,int256 deltaQty1,uint160 sqrtP,uint128 liquidity,int24 currentTick)'

const contract_interface = new ethers.utils.Interface([
  event_pool_created,
  event_swap
]);

type IMapNumber = {
  [s: Chain | string]: number;
}
const startBlock: IMapNumber = {
  [CHAIN.ARBITRUM]: 14137735,
  [CHAIN.ETHEREUM]: 14932476,
  [CHAIN.BSC]: 18534107,
  [CHAIN.POLYGON]: 29347468,
  [CHAIN.AVAX]: 15797131,
  [CHAIN.OPTIMISM]: 12001267,
  [CHAIN.FANTOM]: 40124588,
  [CHAIN.CRONOS]: 3152290
}

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

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

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));
      const log_create_pools: ILog[] = (await sdk.api.util.getLogs({
        target: factory,
        topic: '',
        toBlock: toBlock,
        fromBlock: startBlock[chain],
        keys: [],
        chain: chain,
        topics: [topic0_pool_created]
      })).output as ILog[]
      const pools = log_create_pools.map((e: ILog) => contract_interface.parseLog(e).args).map((e: any) => e.pool);
      const logs: ILog[] = (await Promise.all(pools.map((address: string) => sdk.api.util.getLogs({
        target: address,
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: chain,
        topics: [topic0_swap]
      }))))
        .map((p: any) => p)
        .map((a: any) => a.output).flat();
      const contract = [...new Set(logs.map((e: ILog) => e.address))];
      const [underlyingToken1] = await Promise.all(
        ['token1'].map((method) =>
          sdk.api.abi.multiCall({
            abi: PAIR_TOKEN_ABI(method),
            calls: contract.map((address: string) => ({
              target: address,
            })),
            chain: chain,
            permitFailure: true
          })
        )
      );
      const token1 = underlyingToken1.output.map((e: any) => e.output);
      const coins: string[] = token1.map((e: string) => `${chain}:${e.toLowerCase()}`);
      const prices = await getPrices(coins, timestamp);
      const untrackAmountUSD = logs.map((e: ILog) => {
        const value = contract_interface.parseLog(e);
        const amount1 = Number(value.args.deltaQty1._hex.replace('-',''))
        const index = contract.findIndex((con: string) => con.toLowerCase() === e.address.toLowerCase())
        const price = prices[ `${chain}:${token1[index].toLowerCase()}`]?.price || 0;
        const decimals = prices[ `${chain}:${token1[index].toLowerCase()}`]?.decimals || 0;
        return (amount1 / 10 ** decimals) * price;
      }).reduce((a: number, b: number) => a + b, 0);
      const dailyVolume = untrackAmountUSD;
      return {
        dailyVolume: `${dailyVolume}`,
        timestamp
      }
    } catch(error) {
      console.error(error)
      throw error;
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1682121600,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: async () => 1682121600,
    },
    // [CHAIN.BSC]: {
    //   fetch: fetch(CHAIN.BSC),
    //   start: async () => 1682121600,
    // },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1682121600,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async () => 1682121600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async () => 1682121600,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async () => 1682121600,
    },
    // [CHAIN.CRONOS]: {
    //   fetch: fetch(CHAIN.CRONOS),
    //   start: async () => 1682121600,
    // },
  }
};

export default adapter;
