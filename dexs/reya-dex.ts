import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

const eventAbis = {
  event_order:
    "event PassivePerpMatchOrder(uint128 indexed marketId, uint128 indexed accountId, int256 orderBase, (uint256 protocolFeeCredit, uint256 exchangeFeeCredit, uint256 takerFeeDebit, int256[] makerPayments, uint256 referrerFeeCredit) matchOrderFees, uint256 executedOrderPrice, uint128 referrerAccountId, uint256 blockTimestamp)",
  event_old_order:
    "event PassivePerpMatchOrder(uint128 indexed marketId, uint128 indexed accountId, int256 orderBase, (uint256 protocolFeeCredit, uint256 exchangeFeeCredit, uint256 takerFeeDebit, int256[] makerPayments) matchOrderFees, uint256 executedOrderPrice, uint256 blockTimestamp)",
  // Emitted in the same executeOrder call as PassivePerpMatchOrder; gives us the oracle
  // price the contract used so we can back out (executedPrice - oraclePrice) per trade.
  event_pool_slippage:
    "event PoolPSlippageUpdated(uint128 indexed marketId, int256 premiumIndex, uint256 oraclePrice, uint256 blockTimestamp)",
  event_bridge_fee_paid:
    "event BridgeFeePaid(address indexed receiver, address indexed token, uint256 tokenFee, uint256 nativeFee, uint256 blockTimestamp)",
};

const CONFIG = {
  priceDecimals: 18,
  baseDecimals: 18,
  quoteDecimals: 6,
  perpContract: '0x27e5cb712334e101b3c232eb0be198baaa595f5f',
  peripheryContract: '0xCd2869d1eb1BC8991Bc55de9E9B779e912faF736',
  poolAccountId: 2,
  coreProxy: '0xA763B6a5E09378434406C003daE6487FbbDc1a80',
  oracleAdapterProxy: '0x32edABC058C1207fE0Ec5F8557643c28E4FF379e',
}

// Liquidity manager (LM) tokens held by the pool's margin account. The pool earns APY equal to
// balance * (price_end - price_start) per day for each one. Vesting is already
// reflected in getLatestPricePayload's returned price, so no extra handling needed.
// TODO: fill in actual values
const LM_TOKENS: Array<{ address: string; assetPairId: string; decimals: number }> = [
  { address: '0xb6A307Bb281BcA13d69792eAF5Db7c2BBe6De248', assetPairId: 'REYALM#SELINIUSDC', decimals: 18 },
  { address: '0x63FC3F743eE2e70e670864079978a1deB9c18b76', assetPairId: 'REYALM#AMBERUSDC', decimals: 18 },
  { address: '0x3ee6f82498d4e40DB33bac3adDABd8b41eCa1c9c', assetPairId: 'REYALM#HEDGEUSDC', decimals: 18 },
];

const lmAbis = {
  getCollateralInfo:
    "function getCollateralInfo(uint128 accountId, address collateral) external view returns ((int256 netDeposits, int256 marginBalance, int256 realBalance))",
  getLatestPricePayload:
    "function getLatestPricePayload(string assetPairId) external view returns ((string assetPairId, uint256 timestamp, uint256 price))",
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const oraclePriceByTxAndMarket = new Map<string, number>();
  // Signed sum of (orderBase * (executedPrice - oraclePrice)) in RUSD units. 
  // The daily aggregate is the pool's gross capture from spread + price impact combined.
  let poolPremiumAccumulator = 0;

  const processOracleLog = (log: any) => {
    const key = `${log.transactionHash}:${Number(log.args.marketId)}`;
    const newOraclePrice = Number(log.args.oraclePrice);
    oraclePriceByTxAndMarket.set(key, newOraclePrice);
  };

  const processBridgeFeeLog = (log: any) => {
    const token = log.args.token as string;
    const tokenFee = Number(log.args.tokenFee);
    dailyFees.addToken(token, tokenFee, 'Bridge Fees');
    dailyRevenue.addToken(token, tokenFee, 'Bridge Fees To Treasury');
  };

  const processLog = (log: any) => {
    const orderBase = Number(log.args.orderBase);
    const executedPrice = Number(log.args.executedOrderPrice);
    const marketId = Number(log.args.marketId);
    const fees = log.args.matchOrderFees;

    const volume = Math.abs(orderBase) / (10 ** (CONFIG.baseDecimals - CONFIG.quoteDecimals)) * executedPrice / (10 ** CONFIG.priceDecimals);
    const revenue = Number(fees.protocolFeeCredit) + Number(fees.exchangeFeeCredit);
    const fee = Number(fees.takerFeeDebit);

    dailyVolume.addToken(ADDRESSES.reya.RUSD, volume);
    dailyFees.addToken(ADDRESSES.reya.RUSD, fee, 'Trading Fees');
    dailyRevenue.addToken(ADDRESSES.reya.RUSD, revenue, 'Trading Fees To Treasury');
    dailySupplySideRevenue.addToken(ADDRESSES.reya.RUSD, fee - revenue, 'Trading Fees To Stakers');

    const oraclePrice = oraclePriceByTxAndMarket.get(`${log.transactionHash}:${marketId}`);
    if (oraclePrice !== undefined && oraclePrice > 0) {
      const baseRusd = orderBase / (10 ** (CONFIG.baseDecimals - CONFIG.quoteDecimals));
      const priceDelta = (executedPrice - oraclePrice) / (10 ** CONFIG.priceDecimals);
      poolPremiumAccumulator += baseRusd * priceDelta;
    }
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
    const [older_logs, newer_logs, oracle_logs, bridge_fee_logs] = await Promise.all([
      options.getLogs({
        target: CONFIG.perpContract,
        eventAbi: eventAbis.event_old_order,
        fromBlock: batch.fromBlock,
        toBlock: batch.toBlock,
        skipCache: true,
        skipCacheRead: true,
        onlyArgs: false,
      }),
      options.getLogs({
        target: CONFIG.perpContract,
        eventAbi: eventAbis.event_order,
        fromBlock: batch.fromBlock,
        toBlock: batch.toBlock,
        skipCache: true,
        skipCacheRead: true,
        onlyArgs: false,
      }),
      options.getLogs({
        target: CONFIG.perpContract,
        eventAbi: eventAbis.event_pool_slippage,
        fromBlock: batch.fromBlock,
        toBlock: batch.toBlock,
        skipCache: true,
        skipCacheRead: true,
        onlyArgs: false,
      }),
      options.getLogs({
        target: CONFIG.peripheryContract,
        eventAbi: eventAbis.event_bridge_fee_paid,
        fromBlock: batch.fromBlock,
        toBlock: batch.toBlock,
        skipCache: true,
        skipCacheRead: true,
        onlyArgs: false,
      }),
    ]);
    // Oracle logs first so the map is populated before match logs look it up.
    oracle_logs.forEach(processOracleLog);
    older_logs.forEach(processLog);
    newer_logs.forEach(processLog);
    bridge_fee_logs.forEach(processBridgeFeeLog);
  }

  // LM token APY accruing to the pool: balance × (price_end - price_start) per token,
  // converted to RUSD raw units. Uses end-of-window balance for simplicity.
  let lmRevenueAccumulator = 0;
  for (const lm of LM_TOKENS) {
    const [collateralInfo, priceStart, priceEnd] = await Promise.all([
      options.toApi.call({
        target: CONFIG.coreProxy,
        abi: lmAbis.getCollateralInfo,
        params: [CONFIG.poolAccountId, lm.address],
      }),
      options.fromApi.call({
        target: CONFIG.oracleAdapterProxy,
        abi: lmAbis.getLatestPricePayload,
        params: [lm.assetPairId],
      }),
      options.toApi.call({
        target: CONFIG.oracleAdapterProxy,
        abi: lmAbis.getLatestPricePayload,
        params: [lm.assetPairId],
      }),
    ]);

    const balanceScaled = Number(collateralInfo.realBalance) / (10 ** lm.decimals);
    const priceStartScaled = Number(priceStart.price) / (10 ** CONFIG.priceDecimals);
    const priceEndScaled = Number(priceEnd.price) / (10 ** CONFIG.priceDecimals);
    if (priceStartScaled === 0 || priceEndScaled === 0) continue; // not initialized

    const revenueUsd = balanceScaled * (priceEndScaled - priceStartScaled);
    const revenueRusd = revenueUsd * (10 ** CONFIG.quoteDecimals);
    lmRevenueAccumulator += revenueRusd;
  }

  if (lmRevenueAccumulator > 0) {
    dailyFees.addToken(ADDRESSES.reya.RUSD, lmRevenueAccumulator, 'Liquidity Fees');
    dailySupplySideRevenue.addToken(ADDRESSES.reya.RUSD, lmRevenueAccumulator, 'Liquidity Fees To Stakers');
  }
  // Net pool capture from spread + price impact. Clamp at the daily level so days where
  // the pool paid more slippage than it earned in spread show 0, not negative fees.
  if (poolPremiumAccumulator > 0) {
    dailyFees.addToken(ADDRESSES.reya.RUSD, poolPremiumAccumulator, 'Liquidity Fees');
    dailySupplySideRevenue.addToken(ADDRESSES.reya.RUSD, poolPremiumAccumulator, 'Liquidity Fees To Stakers');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.REYA],
  start: "2024-08-11",
  fetch,
  methodology: {
    Volume: "Notional volume of trades.",
    Fees: "All fees paid by traders, including the APY earned by stakers.",
    Revenue: "Portion of fees distributed to the DAO Treasury.",
    SupplySideRevenue: "Portion of fees distributed to vaults stakers.",
  },
  breakdownMethodology: {
    Fees: {
      'Trading Fees': 'Trading fees paid by users',
      'Bridge Fees': 'Deposit and withdraw fees paid by users while bridge assest to Reya chain.',
      'Liquidity Fees': 'Total liquidity manager revenue',
    },
    Revenue: {
      'Trading Fees To Treasury': 'A portion of trading fees paid by users collected by protocol treasury',
      'Bridge Fees To Treasury': 'All bridge fees are collected by protocol treasury',
    },
    SupplySideRevenue: {
      'Trading Fees To Stakers': 'A portion of trading fees paid by users distributed to vault stakers',
      'Liquidity Fees To Stakers': 'All liquidity fees are distributed to vault stakers',
    },
  }
};

export default adapters;