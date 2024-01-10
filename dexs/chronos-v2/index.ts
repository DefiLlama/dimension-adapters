import { eth } from "@defillama/sdk/build/api";
import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { getPrices } from "../../utils/prices";

const topic0_create_pool = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
const topic0_event_pool_create = 'event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)';
const topic0_swap = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const topic0_event_swap = 'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)'
const contract_interface = new ethers.Interface([
  topic0_event_pool_create,
  topic0_event_swap
])
const poolFactoryAddress = '0x4Db9D624F67E00dbF8ef7AE0e0e8eE54aF1dee49';

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


const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24;
  try {
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));

    const logs: ILog[] = (await sdk.getEventLogs({
      target: poolFactoryAddress,
      fromBlock: 114041129,
      toBlock: toBlock,
      chain: CHAIN.ARBITRUM,
      topics: [topic0_create_pool],
    })) as ILog[];
    const poolAddresses = logs.map((e: ILog) => contract_interface.parseLog(e)!.args.pool);

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api2.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: poolAddresses.map((address: string) => ({
            target: address,
          })),
          chain: CHAIN.ARBITRUM
        })
      )
    );
    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;

    const coins: string[] =  [...new Set([...tokens0.concat(tokens1).map((e: string) => `${CHAIN.ARBITRUM}:${e}`)])];

    const logsSwap: ILog[] = (await Promise.all(poolAddresses.map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.ARBITRUM,
      topics: [topic0_swap]
    })))).flat();

    const prices = await getPrices(coins, timestamp);

    const dailyVolume = logsSwap.map((e: ILog) => {
      const parsed = contract_interface.parseLog(e);
      const amount0 = Math.abs(Number(parsed!.args.amount0.toString().replace('-', '')));
      const amount1 = Math.abs(Number(parsed!.args.amount1.toString().replace('-', '')));
      const index = poolAddresses.indexOf(e.address);
      const token0 = tokens0[index];
      const token1 = tokens1[index];
      const price0 = prices[`${CHAIN.ARBITRUM}:${token0}`]?.price || 0;
      const price1 = prices[`${CHAIN.ARBITRUM}:${token1}`]?.price || 0;
      const decimals0 = prices[`${CHAIN.ARBITRUM}:${token0}`]?.decimals || 0;
      const decimals1 = prices[`${CHAIN.ARBITRUM}:${token1}`]?.decimals || 0;
      return price0 ? (amount0 / 10 ** decimals0) * price0 : (amount1/10**decimals1) * price1;
    }).reduce((a: number, b: number) => a + b, 0)

    return {
      dailyVolume: dailyVolume.toString(),
      timestamp
    }
  } catch(error) {
    console.error(error)
    throw error;
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume,
      start: async () => 1690070400,
    }
  }
}

export default adapters;
