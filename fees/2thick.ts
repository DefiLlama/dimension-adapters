import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { filterPools } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const poolFactoryAddress = '0xE6dA85feb3B4E0d6AEd95c41a125fba859bB9d24';
const slot0ABI = 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)';
const feeABI = 'function fee() view returns (uint24)';
const poolCreationEventABI = 'event PoolCreated (address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const swapEventABI = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';
const feeChangeEventABI = 'event SetFeeProtocol(uint8 feeProtocol0Old, uint8 feeProtocol1Old, uint8 feeProtocol0New, uint8 feeProtocol1New)';

const methodology = {
  UserFees: "Traders using 2Thick Liquidiy pay a Trading fee on each swap. Includes Flash Loan Fees.",
  Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
  Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
  ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
  HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
  SupplySideRevenue: "The portion of trading fees paid to liquidity providers."
}

// This fork doesnt split feeProtocol into two uint4 values
const fetch = async (fetchOptions: FetchOptions) => {
  const dailyRevenue = fetchOptions.createBalances();
  const dailyVolume = fetchOptions.createBalances();
  const dailyFees = fetchOptions.createBalances();

  if (adapters?.adapter == undefined) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
  const fromBlock = await fetchOptions.getBlock(
    adapters.adapter[fetchOptions.chain].start as number || 0,
    fetchOptions.chain,
    {}
  );

  let pairObjectLocal: Record<string, string[]> = {};
  const poolCreationLogs = await fetchOptions.getLogs({
    target: poolFactoryAddress,
    fromBlock,
    toBlock: await fetchOptions.getToBlock(),
    eventAbi: poolCreationEventABI,
    onlyArgs: true,
  });
  poolCreationLogs.forEach(log => {
    pairObjectLocal[log.pool] = [log.token0, log.token1];
  });

  const topPools = await filterPools({
    api: fetchOptions.api,
    pairs: pairObjectLocal,
    createBalances: fetchOptions.createBalances,
  });
  pairObjectLocal = Object.fromEntries(
    Object.keys(topPools).map(pool => [pool, pairObjectLocal[pool]])
  );

  for (const pool of Object.keys(pairObjectLocal)) {
    const fromFeeProtocol = await fetchOptions.api.call({
      target: pool,
      field: 'feeProtocol',
      block: await fetchOptions.getFromBlock(),
      abi: slot0ABI,
    });
    const toFeeProtocol = await fetchOptions.api.call({
      target: pool,
      field: 'feeProtocol',
      block: await fetchOptions.getToBlock(),
      abi: slot0ABI,
    });
    if (fromFeeProtocol === undefined || toFeeProtocol === undefined) continue;
    if (fromFeeProtocol === 0) continue;

    const swapFee = await fetchOptions.api.call({ target: pool, abi: feeABI });
    const fee = (swapFee?.toString() || 0) / 1e6;

    const swapLogs = await fetchOptions.getLogs({
      target: pool,
      fromBlock: await fetchOptions.getFromBlock(),
      toBlock: await fetchOptions.getToBlock(),
      eventAbi: swapEventABI,
      onlyArgs: false,
    });
    if (!swapLogs.length) continue;

    let feeTimeline: { feeProtocol: number, block: number }[] = [{
      feeProtocol: fromFeeProtocol,
      block: await fetchOptions.getFromBlock()
    }];
    if (fromFeeProtocol !== toFeeProtocol) {
      const feeChangeLogs = await fetchOptions.getLogs({
        target: pool,
        eventAbi: feeChangeEventABI,
        fromBlock: await fetchOptions.getFromBlock(),
        toBlock: await fetchOptions.getToBlock(),
      });
      for (const feeChangeLog of feeChangeLogs) {
        feeTimeline.push({
          feeProtocol: feeChangeLog.args.feeProtocolNew,
          block: feeChangeLog.blockNumber
        });
      }
    }

    for (const log of swapLogs) {
      let active = feeTimeline[0];
      for (const fc of feeTimeline) {
        if (fc.block <= log.blockNumber) active = fc;
        else break;
      }

      const swapFee0 = Number(log.args.amount0.toString()) * fee;
      const swapFee1 = Number(log.args.amount1.toString()) * fee;
      const protocolFee = active.feeProtocol === 0 ? 0 : (1 / active.feeProtocol);

      addOneToken({
        chain: fetchOptions.chain,
        balances: dailyVolume,
        token0: pairObjectLocal[pool][0],
        token1: pairObjectLocal[pool][1],
        amount0: log.args.amount0,
        amount1: log.args.amount1
      });
      addOneToken({
        chain: fetchOptions.chain,
        balances: dailyFees,
        token0: pairObjectLocal[pool][0],
        token1: pairObjectLocal[pool][1],
        amount0: swapFee0,
        amount1: swapFee1
      });
      addOneToken({
        chain: fetchOptions.chain,
        balances: dailyRevenue,
        token0: pairObjectLocal[pool][0],
        token1: pairObjectLocal[pool][1],
        amount0: swapFee0 * protocolFee,
        amount1: swapFee1 * protocolFee
      });
    }
  }
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: fetch,
      start: 1699286400, // "Nov-7-23",
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: 1699372800, // "Nov-8-23",
    },
    [CHAIN.SONIC]: {
      fetch: fetch,
      start: 1739577600, // "Dec-15-24",
    },

  },
};

adapters.methodology = methodology;
export default adapters;

