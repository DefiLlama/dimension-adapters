import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IAmount {
  amount0: number;
  amount1: number;
}

const topic0 =
  "0xf5b850648f086f3f988a2c06dd4214f39db9fa92ee563e6246c398361d1963ad";
const FACTORY_ADDRESS = "0x472f3C3c9608fe0aE8d702f3f8A2d12c410C881A";

type TABI = {
  [k: string]: string;
};
const ABIs: TABI = {
  "allPairsLength": "uint256:allPairsLength",
  "allPairs": "function allPairs(uint256) view returns (address)"
}
process.env.FANTOM_BATCH_MAX_COUNT = "10"; // 10 is the default value

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;
  try {
    const poolLength = (
      await sdk.api2.abi.call({
        target: FACTORY_ADDRESS,
        chain: CHAIN.FANTOM,
        abi: ABIs.allPairsLength,
      })
    );

    const poolsRes = await sdk.api2.abi.multiCall({
      abi: ABIs.allPairs,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: CHAIN.FANTOM,
      permitFailure: true,
    });

    const lpTokens = poolsRes

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ["address:token0", "address:token1"].map((method) =>
        sdk.api2.abi.multiCall({
          abi: method,
          calls: lpTokens,
          chain: CHAIN.FANTOM,
          permitFailure: true,
        })
      )
    );

    const tokens0 = underlyingToken0;
    const tokens1 = underlyingToken1;
    const fromBlock = await getBlock(fromTimestamp, CHAIN.FANTOM, {});
    const toBlock = await getBlock(toTimestamp, CHAIN.FANTOM, {});
    const logs: ILog[][] = (
      await Promise.all(
        lpTokens.map((address: string) =>
          sdk.getEventLogs({
            target: address,
            toBlock: toBlock,
            fromBlock: fromBlock,
            chain: CHAIN.FANTOM,
            topics: [topic0],
            skipCache: true,
          })
        )
      )
    ) as any

    const rawCoins = [...tokens0, ...tokens1].map(
      (e: string) => `${CHAIN.FANTOM}:${e}`
    );
    const coins = [...new Set(rawCoins)];
    const prices = await getPrices(coins, timestamp);
    const fees: number[] = lpTokens.map((_: string, index: number) => {
      const token0Decimals =
        prices[`${CHAIN.FANTOM}:${tokens0[index]}`]?.decimals || 0;
      const token1Decimals =
        prices[`${CHAIN.FANTOM}:${tokens1[index]}`]?.decimals || 0;
      const log: IAmount[] = logs[index]
        .map((e: ILog) => {
          return { ...e, data: e.data.replace("0x", "") };
        })
        .map((p: ILog) => {
          // event GaugeFees(address indexed token, uint amount, address externalBribe);
          const [, token] = p.topics;
          const isToken0 =
            "0x" + token.substring(26).toLowerCase() ===
            tokens0[index].toLowerCase();
          const isToken1 =
            "0x" + token.substring(26).toLowerCase() ===
            tokens1[index].toLowerCase();
          if (isToken0) {
            return {
              amount0:
                Number("0x" + p.data.slice(0, 64)) / 10 ** token0Decimals,
              amount1: 0,
            };
          }
          if (isToken1) {
            return {
              amount0: 0,
              amount1:
                Number("0x" + p.data.slice(0, 64)) / 10 ** token1Decimals,
            };
          }
          return {
            amount0: 0,
            amount1: 0,
          } as IAmount;
        }) as IAmount[];

      const token0Price =
        prices[`${CHAIN.FANTOM}:${tokens0[index]}`]?.price || 0;
      const token1Price =
        prices[`${CHAIN.FANTOM}:${tokens1[index]}`]?.price || 0;

      const feesAmount0 =
        log.reduce((a: number, b: IAmount) => Number(b.amount0) + a, 0) *
        token0Price;
      const feesAmount1 =
        log.reduce((a: number, b: IAmount) => Number(b.amount1) + a, 0) *
        token1Price;

      const feesUSD = feesAmount0 + feesAmount1;
      return feesUSD;
    });

    const dailyFees = fees.reduce((a: number, b: number) => a + b, 0);
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyFees}`,
      dailyHoldersRevenue: `${dailyFees}`,
      timestamp,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: async () => 1688172646,
    },
  },
};

export default adapter;
