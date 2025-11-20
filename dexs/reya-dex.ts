import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

const eventAbis = {
  event_order:
    "event PassivePerpMatchOrder(uint128 indexed marketId, uint128 indexed accountId, int256 orderBase, (uint256 protocolFeeCredit, uint256 exchangeFeeCredit, uint256 takerFeeDebit, int256[] makerPayments, uint256 referrerFeeCredit) matchOrderFees, uint256 executedOrderPrice, uint128 referrerAccountId, uint256 blockTimestamp)",
  event_old_order:
    "event PassivePerpMatchOrder(uint128 indexed marketId, uint128 indexed accountId, int256 orderBase, (uint256 protocolFeeCredit, uint256 exchangeFeeCredit, uint256 takerFeeDebit, int256[] makerPayments) matchOrderFees, uint256 executedOrderPrice, uint256 blockTimestamp)",
};

const functionAbis = {
  getSharePrice: "function getSharePrice(uint128 poolId) external view returns (uint256)",
  getShareSupply: "function getShareSupply(uint128 poolId) external view returns (uint256)",
};

const CONFIG = {
  priceDecimals: 18,
  baseDecimals: 18,
  quoteDecimals: 6,
  supplyDecimals: 30,
  poolId: 1,
  poolContract: '0xB4B77d6180cc14472A9a7BDFF01cc2459368D413',
  perpContract: '0x27e5cb712334e101b3c232eb0be198baaa595f5f',
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Fetch fees paid through spreads to the pool
  const [sharePriceStart, sharePriceEnd, shareSupplyEnd] = await Promise.all([
    options.fromApi.call({
      target: CONFIG.poolContract,
      abi: functionAbis.getSharePrice,
      params: [CONFIG.poolId],
      permitFailure: true,
    }),
    options.toApi.call({
      target: CONFIG.poolContract,
      abi: functionAbis.getSharePrice,
      params: [CONFIG.poolId],
      permitFailure: true,
    }),
    options.toApi.call({
      target: CONFIG.poolContract,
      abi: functionAbis.getShareSupply,
      params: [CONFIG.poolId],
    })
  ]);

  // Calculate pool fees from share price changes, there is contract bug, ignore when failed to get price share
  if (sharePriceStart && sharePriceEnd && shareSupplyEnd) {
    const supplyEndRusd = Number(shareSupplyEnd) / (10 ** (CONFIG.supplyDecimals - CONFIG.quoteDecimals));
    const poolFees = (Number(sharePriceEnd) - Number(sharePriceStart)) * supplyEndRusd / (10 ** CONFIG.priceDecimals);
  
    if (poolFees > 0) {
      dailyFees.addToken(ADDRESSES.reya.RUSD, poolFees);
    }
  }


  const processLog = (log: any) => {
    const orderBase = Number(log.orderBase);
    const executedPrice = Number(log.executedOrderPrice);
    const fees = log.matchOrderFees;
    
    const volume = Math.abs(orderBase) / (10 ** (CONFIG.baseDecimals - CONFIG.quoteDecimals)) * executedPrice / (10 ** CONFIG.priceDecimals);
    const revenue = Number(fees.protocolFeeCredit) + Number(fees.exchangeFeeCredit);
    const fee = Number(fees.takerFeeDebit);

    dailyVolume.addToken(ADDRESSES.reya.RUSD, volume);
    dailyFees.addToken(ADDRESSES.reya.RUSD, fee);
    dailyRevenue.addToken(ADDRESSES.reya.RUSD, revenue);
  };

  // Get block range and split into batches to avoid memory issues
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  const BLOCKS_PER_BATCH = 10000;
  const batches: Array<{ fromBlock: number; toBlock: number }> = [];
  for (let block = fromBlock; block <= toBlock; block += BLOCKS_PER_BATCH) {
    batches.push({
      fromBlock: block,
      toBlock: Math.min(block + BLOCKS_PER_BATCH - 1, toBlock),
    });
  }

  for (const batch of batches) {
    const [older_logs, newer_logs] = await Promise.all([
      options.getLogs({
        target: CONFIG.perpContract,
        eventAbi: eventAbis.event_old_order,
        fromBlock: batch.fromBlock,
        toBlock: batch.toBlock,
        skipCache: true,
        skipCacheRead: true,
      }),
      options.getLogs({
        target: CONFIG.perpContract,
        eventAbi: eventAbis.event_order,
        fromBlock: batch.fromBlock,
        toBlock: batch.toBlock,
        skipCache: true,
        skipCacheRead: true,
      })
    ]);
    older_logs.forEach(processLog);
    newer_logs.forEach(processLog);
  }

  return { dailyFees, dailyRevenue, dailyVolume };
};

const adapters: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: "Notional volume of trades",
    Fees: "All fees paid by traders, including the APY earned by stakers",
    Revenue: "Portion of fees distributed to the DAO Treasury",
  },
  chains: [CHAIN.REYA],
  start: "2024-03-20",
  fetch,
};

export default adapters;