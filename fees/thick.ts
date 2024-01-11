import { eth } from "@defillama/sdk/build/api";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { getPrices } from "../utils/prices";

const poolFactoryAddress = '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24';
const topic0_create_pool = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
const topic0_event_pool_create = 'event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)';
const topic0_swap = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const topic0_event_swap = 'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)'
const contract_interface = new ethers.Interface([
  topic0_event_pool_create,
  topic0_event_swap
])
const fromBlocks = {
  "fantom":      70309749  ,
  "arbitrum" :   148243463 ,
  "base" :       6314325
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

const graph = (_chain: Chain) => {
  return async (timestamp: number) => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 60 * 60 * 24;
    try {
      const fromBlock = (await getBlock(fromTimestamp, _chain, {}));
      const toBlock = (await getBlock(toTimestamp, _chain, {}));
      const logs: ILog[] = (await sdk.getEventLogs({
        target: poolFactoryAddress,
        fromBlock: fromBlocks[_chain as keyof typeof fromBlocks],
        toBlock: toBlock,
        chain: _chain,
        topics: [topic0_create_pool],
      })) as ILog[];
      const poolAddresses = logs.map((e: ILog) => contract_interface.parseLog(e)!.args.pool);
      const poolFees = logs.map((e: ILog) => contract_interface.parseLog(e)!.args.fee);
      const tokens0 = logs.map((e: ILog) => contract_interface.parseLog(e)!.args.token0);
      const tokens1 = logs.map((e: ILog) => contract_interface.parseLog(e)!.args.token1);

      const coins: string[] =  [...new Set([...tokens0.concat(tokens1).map((e: string) => `${_chain}:${e}`)])];

      const logsSwap: ILog[] = (await Promise.all(poolAddresses.map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: _chain,
        topics: [topic0_swap]
      })))).flat();

      const prices = await getPrices(coins, timestamp);

      const dailyFees = logsSwap.map((e: ILog) => {
        const parsed = contract_interface.parseLog(e);
        const amount0 = Math.abs(Number(parsed!.args.amount0.toString().replace('-', '')));
        const amount1 = Math.abs(Number(parsed!.args.amount1.toString().replace('-', '')));
        const index = poolAddresses.indexOf(e.address);
        const token0 = tokens0[index];
        const token1 = tokens1[index];
        const poolFee = Number(poolFees[index] || 0);
        const price0 = prices[`${_chain}:${token0}`]?.price || 0;
        const price1 = prices[`${_chain}:${token1}`]?.price || 0;
        const decimals0 = prices[`${_chain}:${token0}`]?.decimals || 0;
        const decimals1 = prices[`${_chain}:${token1}`]?.decimals || 0;
        return price0 ? (amount0 / 10 ** decimals0) * price0 * (poolFee/1e6) : (amount1/10**decimals1) * price1 * (poolFee/1e6);
      }).reduce((a: number, b: number) => a + b, 0)

      return {
        dailyFees:             `${dailyFees}`,
        dailyUserFees:         `${dailyFees}`,
        /* pool.feeProtocol can change.. TO DO!
        dailyProtocolRevenue:  `${dailyFees*27/255}`,
        dailyRevenue:          `${dailyFees*27/255}`,
        dailyHoldersRevenue:   `${dailyFees*27/255}`,
        dailySupplySideRevenue:`${dailyFees*228/255}`,
        */
        timestamp
      }
    } catch(error) {
      console.error(error)
      throw error;
    }
  }
}

const methodology = {
  UserFees: "Traders using Thick Liquidiy pay a Trading fee on each swap. Includes Flash Loan Fees.",
  Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
  Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
  ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
  HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
  SupplySideRevenue: "The portion of trading fees paid to liquidity providers."
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: graph(CHAIN.FANTOM),
      start: async () => 1699300000,
      meta: { methodology: { ...methodology, } },
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: async () => 1699300000,
      meta: { methodology: { ...methodology, } },
    },
    [CHAIN.BASE]: {
      fetch: graph(CHAIN.BASE),
      start: async () => 1699300000,
      meta: { methodology: { ...methodology, } },
    }
  }
}

export default adapters;
