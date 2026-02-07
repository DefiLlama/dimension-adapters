import { CHAIN } from "../../helpers/chains";
import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { filterPools } from "../../helpers/uniswap";
import { ethers } from "ethers";
import { addOneToken } from "../../helpers/prices";

const poolEvent = "event Pool(address indexed token0, address indexed token1, address pool)";
const poolSwapEvent = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const factory = "0x5f95E92c338e6453111Fc55ee66D4AafccE661A7";
const fromBlock = 1102201;

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;

  let logs = await options.getLogs({
    target: factory,
    eventAbi: poolEvent,
    cacheInCloud: true,
    fromBlock: fromBlock,
    entireLog: true,
  });

  const iface = new ethers.Interface([poolEvent]);
  logs = logs.map((log: any) => iface.parseLog(log)?.args);

  const pairObject: IJSON<string[]> = {};
  const fees: any = {};

  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1];
  });
  let _fees = await api.multiCall({
    abi: "function fee() view returns (uint24)",
    calls: logs.map((log: any) => log.pool),
  });
  _fees.forEach((fee: any, i: number) => (fees[logs[i].pool] = fee / 1e6));

  const filteredPairs = await filterPools({
    api,
    pairs: pairObject,
    createBalances,
  });
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  if (!Object.keys(filteredPairs).length)
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
    };

  const allLogs = await getLogs({
    targets: Object.keys(filteredPairs),
    eventAbi: poolSwapEvent,
    flatten: false,
  });
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = Object.keys(filteredPairs)[index];
    const [token0, token1] = pairObject[pair];
    const fee = fees[pair];
    logs.forEach((log: any) => {
      addOneToken({
        chain,
        balances: dailyVolume,
        token0,
        token1,
        amount0: log.amount0,
        amount1: log.amount1,
      });
      addOneToken({
        chain,
        balances: dailyFees,
        token0,
        token1,
        amount0: log.amount0.toString() * fee,
        amount1: log.amount1.toString() * fee,
      });
      addOneToken({
        chain,
        balances: dailyRevenue,
        token0,
        token1,
        amount0: log.amount0.toString() * fee * 0.985,
        amount1: log.amount1.toString() * fee * 0.985,
      });
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "All swap fees paid by users.",
  UserFees: "All swap fees paid by users.",
  SupplySideRevenue: "No fees distributed to LPs.",
  Revenue: "98.5% of swap fees are revenue. remaining 1.5% are distributed to Algebra.",
  ProtocolRevenue: "Protocol makes no revenue.",
  HoldersRevenue: "98.5% of revenue are distributed to veKITTENs holders. remaining 1.5% are distributed to Algebra.",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  methodology
};

export default adapter;
