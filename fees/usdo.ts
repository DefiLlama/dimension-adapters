import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";
import { getPrices } from "../utils/prices";

// 0x60169dab7aa9a27d6f8702d2543f3531c58e9efa472a54f753e67329c2713907
interface ILog {
  data: string;
  transactionHash: string;
}

interface IAmount {
  amount0In: number;
  amount1In: number;
  amount0Out: number;
  amount1Out: number;
}

const usdo = '0x3D513abc13f53A1E18Ae59A7B5B0930E55733C87';
const router_1 = '0xDE74Dd9Da2b38F92cCCE5f6bf46f3D34b21ce79C';
const router_2 = '0xC00343b51Dc43DEbEFf960293101DA5c09F03f7d';
const pools: string[] = [
  router_1,
  router_2,
]

const topic0_increase_value = '0x8ba9e55d654c01fafe9a9dadb284af89fae3126f7b9b50355639672bd22bdbe5';
const event_increase_value = 'event IncreaseValue(address indexed from, uint256 usdValue)';
const topic0_swap = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const topic0_withdraw = '0xdf273cb619d95419a9cd0ec88123a0538c85064229baa6363788f743fff90deb';

const contract_interface = new ethers.Interface([
  event_increase_value,
]);

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  throw new Error("I think neither of these should be counted as fees? or we just count 0.5% of redeemed USDO as fees?")

  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ONUS, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ONUS, {}));
  const logs_increase_value = (await sdk.getEventLogs({
    target: usdo,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ONUS,
    topics: [topic0_increase_value]
  })).map(((e: any) => contract_interface.parseLog(e)));

  const logs_tx: string[] = (await sdk.getEventLogs({
    target: usdo,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ONUS,
    topics: [topic0_withdraw]
  })).map((e: any) => e.transactionHash.toLowerCase());

  const logs: ILog[][] = (await Promise.all(pools.map((address: string) => sdk.getEventLogs({
    target: address,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ONUS,
    topics: [topic0_swap]
  })))) as any;

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['address:token0', 'address:token1'].map((method) =>
      sdk.api2.abi.multiCall({
        abi: method,
        calls: pools.map((address: string) => ({
          target: address,
        })),
        chain: CHAIN.ONUS
      })
    )
  );

  const tokens0 = underlyingToken0;
  const tokens1 = underlyingToken1;
  const rawCoins = [...tokens0, ...tokens1].map((e: string) => `${CHAIN.ONUS}:${e}`);
  const coins = [...new Set(rawCoins)]
  const prices = await getPrices(coins, timestamp);

  const untrackVolumes: number[] = pools.map((_: string, index: number) => {
    const token0Decimals = (prices[`${CHAIN.ONUS}:${tokens0[index]}`]?.decimals || 0)
    const token1Decimals = (prices[`${CHAIN.ONUS}:${tokens1[index]}`]?.decimals || 0)
    const log: IAmount[] = logs[index]
      .filter((e: ILog) => logs_tx.includes(e.transactionHash.toLowerCase()))
      .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
      .map((p: ILog) => {
        const amount0In = Number('0x' + p.data.slice(0, 64)) / 10 ** token0Decimals;
        const amount1In = Number('0x' + p.data.slice(64, 128)) / 10 ** token1Decimals;
        const amount0Out = Number('0x' + p.data.slice(128, 192)) / 10 ** token0Decimals;
        const amount1Out = Number('0x' + p.data.slice(192, 256)) / 10 ** token1Decimals;
        return {
          amount0In,
          amount1In,
          amount0Out,
          amount1Out,
        } as IAmount
      }) as IAmount[];
    const token0Price = (prices[`${CHAIN.ONUS}:${tokens0[index]}`]?.price || 0);
    const token1Price = (prices[`${CHAIN.ONUS}:${tokens1[index]}`]?.price || 0);

    const totalAmount0 = log
      .reduce((a: number, b: IAmount) => Number(b.amount0In) + Number(b.amount0Out) + a, 0) * token0Price;
    const totalAmount1 = log
      .reduce((a: number, b: IAmount) => Number(b.amount1In) + Number(b.amount1Out) + a, 0) * token1Price;

    const untrackAmountUSD = token0Price !== 0 ? totalAmount0 : token1Price !== 0 ? totalAmount1 : 0; // counted only we have price data
    return untrackAmountUSD;
  });

  const increase_value_fees = logs_increase_value.map((e: any) => {
    return Number(e!.args.usdValue) / 10 ** 18
  }).reduce((a: number, b: number) => a + b, 0)
  const swapFees = untrackVolumes.reduce((a: number, b: number) => a + b, 0);

  const dailyFee = increase_value_fees + swapFees;
  return {
    dailyFees: `${dailyFee}`,
    dailyRevenue: `${dailyFee}`,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ONUS]: {
      fetch,
      start: 1680307200,
    },
  },
}
export default adapter;
