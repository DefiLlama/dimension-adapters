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
  // Perp OB (order book) fills, emitted once per fill by the same PassivePerp proxy from the
  // cutover block onwards. Source: Reya-Labs/reya-network instruments/passive-perp/src/libraries/Events.sol.
  event_execution_v3:
    "event PassivePerpExecutionV3(uint128 indexed marketId, uint128 exchangeId, uint128 indexed accountId, uint128 counterpartyAccountId, uint128 indexed eventSequenceNumber, uint256 blockTimestamp, (int256 executedBase, (uint256 protocolFeeCredit, uint256 referrerFeeCredit, uint256 takerRebateCredit, uint256 poolFeeCredit) perpFillFees, uint256 executedPrice, uint128 referrerAccountId, uint8 executionType, (int256 base, int256 realizedPnL, (uint256 price, uint256 timestamp) lastPriceData, (int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) trackers, int256 averageEntryFundingValue, uint128 session) positionData, (int256 base, int256 realizedPnL, (uint256 price, uint256 timestamp) lastPriceData, (int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) trackers, int256 averageEntryFundingValue, uint128 session) counterpartyPositionData, (int256 base, int256 realizedPnL, (uint256 price, uint256 timestamp) lastPriceData, (int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) trackers, int256 averageEntryFundingValue, uint128 session) preOrderPositionData, (int256 base, int256 realizedPnL, (uint256 price, uint256 timestamp) lastPriceData, (int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) trackers, int256 averageEntryFundingValue, uint128 session) preOrderCounterpartyPositionData, address positionAccountOwner, address counterpartyAccountOwner, uint64 accountOrderId, uint64 counterpartyOrderId, uint128 counterpartyExchangeId, uint256 meNonce, bytes metadata) data)",
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
  // Perp OB upgrade block (2026-09-28 08:53:07 UTC). The passive-pool AMM events
  // (PassivePerpMatchOrder, PoolPSlippageUpdated) end before this block; order-book
  // fills (PassivePerpExecutionV3) start from it. Reading each set only on its side of
  // the boundary means no window is double counted or skipped.
  perpObCutoverBlock: 244533378,
}

// PassivePerpExecutionV3.data.executionType for an order-book match. The other types are
// liquidations (1-3), ADL (4) and market close (5), which are not trading volume.
// Source: reya-network instruments/passive-perp/src/libraries/DataTypes.sol (ExecutionType).
const EXECUTION_TYPE_MATCH_ORDER = 0;

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

  const processExecutionV3Log = (log: any) => {
    const { executedBase, executedPrice, executionType, perpFillFees } = log.args.data;

    // One event per fill: the taker is accountId and the maker is counterpartyAccountId, so
    // counting each event once is taker volume.
    if (Number(executionType) === EXECUTION_TYPE_MATCH_ORDER) {
      const base = BigInt(executedBase);
      const absBase = base < 0n ? -base : base;
      // base and price are 18 decimals; RUSD has 6.
      const volume = absBase * BigInt(executedPrice) / 10n ** BigInt(CONFIG.baseDecimals + CONFIG.priceDecimals - CONFIG.quoteDecimals);
      dailyVolume.addToken(ADDRESSES.reya.RUSD, volume);
    }

    // Only takers pay a fee (makers pay nothing). The gross fee is the sum of four legs, already
    // in RUSD units: the treasury keeps the residual, and the rest goes to the passive pool, the
    // referrer and back to the taker as an instant rebate (referee, OG and VLTZ programmes).
    // Source: reya-network instruments/passive-perp/src/libraries/DataTypes.sol (PerpFillFees).
    // Fees are read from every execution type; today only order-book matches carry one.
    const { protocolFeeCredit, poolFeeCredit, referrerFeeCredit, takerRebateCredit } = perpFillFees;
    const takerFee = BigInt(protocolFeeCredit) + BigInt(poolFeeCredit) + BigInt(referrerFeeCredit) + BigInt(takerRebateCredit);
    dailyFees.addToken(ADDRESSES.reya.RUSD, takerFee, 'Trading Fees');
    dailyRevenue.addToken(ADDRESSES.reya.RUSD, protocolFeeCredit, 'Trading Fees To Treasury');
    dailySupplySideRevenue.addToken(ADDRESSES.reya.RUSD, poolFeeCredit, 'Trading Fees To Stakers');
    dailySupplySideRevenue.addToken(ADDRESSES.reya.RUSD, referrerFeeCredit, 'Trading Fees To Referrers');
    dailySupplySideRevenue.addToken(ADDRESSES.reya.RUSD, takerRebateCredit, 'Trading Fee Rebates To Takers');
  };

  // Get block range and split into batches to avoid memory issues
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  // Reya's RPC provider rejects eth_getLogs spanning more than 2,000 blocks (HTTP 400),
  // so batches have to stay under that. Each call below filters to a single event and the
  // busiest one runs ~3.8 logs/block, so a 1,000-block batch returns ~3.8k logs — well
  // inside the provider's 20,000-logs-per-response cap.
  const BLOCKS_PER_BATCH = 1000;
  const batches: Array<{ fromBlock: number; toBlock: number }> = [];
  for (let block = fromBlock; block <= toBlock; block += BLOCKS_PER_BATCH) {
    batches.push({
      fromBlock: block,
      toBlock: Math.min(block + BLOCKS_PER_BATCH - 1, toBlock),
    });
  }

  const getLogs = (target: string, eventAbi: string, batch: { fromBlock: number; toBlock: number }) => options.getLogs({
    target,
    eventAbi,
    fromBlock: batch.fromBlock,
    toBlock: batch.toBlock,
    skipCache: true,
    skipCacheRead: true,
    onlyArgs: false,
  });

  for (const batch of batches) {
    const hasAmmBlocks = batch.fromBlock < CONFIG.perpObCutoverBlock;
    const hasPerpObBlocks = batch.toBlock >= CONFIG.perpObCutoverBlock;
    const [older_logs, newer_logs, oracle_logs, execution_v3_logs, bridge_fee_logs] = await Promise.all([
      hasAmmBlocks ? getLogs(CONFIG.perpContract, eventAbis.event_old_order, batch) : [],
      hasAmmBlocks ? getLogs(CONFIG.perpContract, eventAbis.event_order, batch) : [],
      hasAmmBlocks ? getLogs(CONFIG.perpContract, eventAbis.event_pool_slippage, batch) : [],
      hasPerpObBlocks ? getLogs(CONFIG.perpContract, eventAbis.event_execution_v3, batch) : [],
      getLogs(CONFIG.peripheryContract, eventAbis.event_bridge_fee_paid, batch),
    ]);
    // Oracle logs first so the map is populated before match logs look it up.
    oracle_logs.forEach(processOracleLog);
    older_logs.forEach(processLog);
    newer_logs.forEach(processLog);
    execution_v3_logs.forEach(processExecutionV3Log);
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
    Volume: "Notional volume of trades. Since the order book upgrade on 2026-09-28 this is order-book taker volume, excluding liquidations.",
    Fees: "All fees paid by traders, including the APY earned by stakers.",
    Revenue: "Portion of fees distributed to the DAO Treasury.",
    SupplySideRevenue: "Portion of fees distributed to vaults stakers, referrers and, since the order book upgrade on 2026-09-28, rebated to takers.",
  },
  breakdownMethodology: {
    Fees: {
      'Trading Fees': 'Trading fees paid by users. Since the order book upgrade on 2026-09-28 only takers pay fees.',
      'Bridge Fees': 'Deposit and withdraw fees paid by users while bridge assest to Reya chain.',
      'Liquidity Fees': 'Total liquidity manager revenue, plus the passive pool spread and price impact while it was the trading counterparty (until 2026-09-28)',
    },
    Revenue: {
      'Trading Fees To Treasury': 'A portion of trading fees paid by users collected by protocol treasury',
      'Bridge Fees To Treasury': 'All bridge fees are collected by protocol treasury',
    },
    SupplySideRevenue: {
      'Trading Fees To Stakers': 'A portion of trading fees paid by users distributed to vault stakers',
      'Trading Fees To Referrers': 'A portion of trading fees paid to the referrer of the taker (order book, since 2026-09-28)',
      'Trading Fee Rebates To Takers': 'A portion of trading fees credited back to takers as an instant rebate under the referee, OG and VLTZ programmes (order book, since 2026-09-28)',
      'Liquidity Fees To Stakers': 'All liquidity fees are distributed to vault stakers',
    },
  }
};

export default adapters;