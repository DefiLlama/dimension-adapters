import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../helpers/getBlock";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { ethers} from 'ethers'
import BigNumber from "bignumber.js";
import { getPrices } from "../utils/prices";

type TAddress = {
  [s: string | Chain]: string;
}
const vualtAddress: TAddress = {
  [CHAIN.OPTIMISM]: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  [CHAIN.FANTOM]: "0x20dd72ed959b6147912c2e529f0a0c651c33c9ce",
}

interface ILogs {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}
const topic0_pools_balance_change = "0xe5ce249087ce04f05a957192435400fd97868dba0e6a4b4c049abf8af80dae78"
const topic0_flash_bot = "0x0d7d75e01ab95780d3cd1c8ec0dd6c2ce19e3a20427eec8bf53283b6fb8e95f0"
const topic0_swap = "0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b";

const event_pools_balance_change = "event PoolBalanceChanged(bytes32 indexed poolId,address indexed liquidityProvider,address[] tokens,int256[] deltas,uint256[] protocolFeeAmounts)"
const event_flash_bot = "event FlashLoan(address indexed recipient,address indexed token,uint256 amount,uint256 feeAmount)"
const event_swap = "event Swap(bytes32 indexed poolId,address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut)"

const contract_interface = new ethers.Interface([
  event_pools_balance_change,
  event_flash_bot,
  event_swap
])

const abis = {
  getPool:{
    "inputs": [
        {
            "internalType": "bytes32",
            "name": "poolId",
            "type": "bytes32"
        }
    ],
    "name": "getPool",
    "outputs": [
        {
            "internalType": "address",
            "name": "",
            "type": "address"
        },
        {
            "internalType": "enum IVault.PoolSpecialization",
            "name": "",
            "type": "uint8"
        }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  getSwapFeePercentage: {
    inputs: [],
    name: "getSwapFeePercentage",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  }
}
interface IBalanceChange {
  tokens: string[];
  protocolFeeAmounts: BigNumber[];
}

interface ISwap {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  amountOut: number;
}

interface SwapFees {
  amountIdUSD: number;
  amountOutUSD: number;
  fee: number;
}

const fetchFees = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const toTimestamp = timestamp
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toBlock = await getBlock(toTimestamp, chain, {})
    const fromBlock = await getBlock(fromTimestamp, chain, {})

    try {
      const logs_balance: ILogs[] = (await sdk.getEventLogs({
        target: vualtAddress[chain],
        fromBlock,
        toBlock,
        topics: [topic0_pools_balance_change],
        chain: chain,
      })) as ILogs[]

      const rawDataBalanceChange: IBalanceChange[] = logs_balance.map((a: ILogs) => {
        const value = contract_interface.parseLog(a)
        return {
          tokens: value!.args.tokens,
          protocolFeeAmounts: value!.args.protocolFeeAmounts
        }
      });

      const logs_flash_bot: ILogs[] = (await sdk.getEventLogs({
        target: vualtAddress[chain],
        fromBlock,
        toBlock,
        topics: [topic0_flash_bot],
        chain: chain,
      })) as ILogs[]

      const logs_swap: ILogs[] = (await sdk.getEventLogs({
        target: vualtAddress[chain],
        fromBlock,
        toBlock,
        topics: [topic0_swap],
        chain: chain,
      })) as ILogs[]

      const swapRaw: ISwap[] = logs_swap.map((a: ILogs) => {
        const value = contract_interface.parseLog(a)
        return {
          poolId: value!.args.poolId,
          tokenIn: value!.args.tokenIn,
          tokenOut: value!.args.tokenOut,
          amountIn: Number(value!.args.amountIn),
          amountOut: Number(value!.args.amountOut),
        } as ISwap
      });
      const poolIds = [...new Set(swapRaw.map((a: ISwap) => a.poolId))]
      const pools = (await sdk.api2.abi.multiCall({
        abi: abis.getPool,
        calls: poolIds.map((a: string) => ({
          target: vualtAddress[chain],
          params: [a]
        })),
        chain: chain,
      })) 
        .map((a: any) => a[0]);

      const swapFees = (await sdk.api2.abi.multiCall({
        abi: abis.getSwapFeePercentage,
        calls: pools.map((a: string) => ({
          target: a,
        })),
        chain: chain,
      })) ;


      const rawDataFlashBot: IBalanceChange[] = logs_flash_bot.map((a: ILogs) => {
        const value = contract_interface.parseLog(a)
        return {
          tokens: [value!.args.token],
          protocolFeeAmounts: [value!.args.feeAmount]
        }
      });

      const coins = [...new Set([...rawDataBalanceChange.flatMap((a: IBalanceChange) => a.tokens), ...rawDataFlashBot.flatMap((a: IBalanceChange) => a.tokens), ...swapRaw.flatMap((a: ISwap) => [a.tokenIn, a.tokenOut])])]
        .map((a: string) => `${chain}:${a.toLowerCase()}`)
      const prices = await getPrices(coins, timestamp)

      const dailyFee = [...rawDataBalanceChange, ...rawDataFlashBot].map((a: IBalanceChange) => {
        return a.tokens.map((b: string, i: number) => {
          const price = prices[`${chain}:${b.toLowerCase()}`]?.price || 0;
          const decimals = prices[`${chain}:${b.toLowerCase()}`]?.decimals || 0;
          if (!price || !decimals) return 0;
          const amount = Number(a.protocolFeeAmounts[i].toString()) / 10 ** decimals;
          return amount * price;
        }).reduce((a: number, b: number) => a + b, 0);
      }).flat().reduce((a: number, b: number) => a + b, 0);

      const dailySwapFees: SwapFees[] = swapRaw.map((a: ISwap) => {
        const priceIn = prices[`${chain}:${a.tokenIn.toLowerCase()}`]?.price || 0;
        const decimalsIn = prices[`${chain}:${a.tokenIn.toLowerCase()}`]?.decimals || 0;
        const priceOut = prices[`${chain}:${a.tokenOut.toLowerCase()}`]?.price || 0;
        const decimalsOut = prices[`${chain}:${a.tokenOut.toLowerCase()}`]?.decimals || 0;
        const amountIn = a.amountIn / 10 ** decimalsIn;
        const amountOut = a.amountOut / 10 ** decimalsOut;
        const amountIdUSD = (amountIn * priceIn)
        const amountOutUSD = (amountOut * priceOut)
        const indexPool = poolIds.indexOf(a.poolId);
        const fee = (Number(swapFees[indexPool] || 0) / 1e18);
        return {
          amountIdUSD,
          amountOutUSD,
          fee
        } as SwapFees
      });
      const dailySwapFeesUSD = dailySwapFees.reduce((a: number, b: any) => a + b.fee  * b.amountIdUSD, 0);

      const dailyFees = dailyFee + dailySwapFeesUSD;
      const dailyRevenue = (dailyFees) * (25/100);
      const dailySupplySideRevenue = dailyFees - dailyRevenue;
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyRevenue}`,
        dailySupplySideRevenue: `${dailySupplySideRevenue}`,
        timestamp,
      }
    } catch (e) {
      console.error(e)
      throw e;
    }
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM),
      start: async () => 1672531200
    },
    [CHAIN.FANTOM]: {
      fetch: fetchFees(CHAIN.FANTOM),
      start: async () => 1672531200
    }
  }
}
export default adapters
