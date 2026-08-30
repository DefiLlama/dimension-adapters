import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const contracts = {
  AMM_FACTORY: "0xCF1FD7f8Ca19c0fCB6051e30D7c58e55F851D1a6",
  CLOB_MARKET_MANAGER: "0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307",
  CTF_EXCHANGE_RETIRED: "0xCf4509B2D036Bfa0e8B775B079164F7c827d4D5b",
  CTF_EXCHANGE: "0x4bC5E872256D12E6017dfe466E04c867DC761B77",
};

const AMM_FACTORY_FROM_BLOCK = 204500;
// current CTFExchange generation deployed here; fee events before it are excluded
const CURRENT_EXCHANGE_FROM_BLOCK = 8984354;

// Both collaterals are $1 USDC stables, but with different decimals
const COLLATERAL_DECIMALS: Record<string, number> = {
  "0xcf65732699b4efc2bc7b87fb6d75f3aaa6cfc867": 18, // legacy XO USDC
  "0x80c12230ce677e6f304027a14780edd2a829ab0c": 6, // current XO USDC
};

// CLOB trading is only on the current 6-decimal USDC
const CLOB_DECIMALS = 6;

const abi = {
  MARKET_CREATED: "event MarketCreated(uint256 indexed marketId, address indexed market, address indexed creator, uint8 versionId, uint40 startsAt, uint40 expiresAt, address collateralToken, uint8 outcomeCount, uint128 initialSharesPerOutcome, uint16 creatorFeeBps, string metaDataURI, (uint256 T0, uint256 alpha0Bps, uint256 T1, uint256 alpha1Bps, uint256 T2, uint256 alpha2Bps, uint256 c1_fp, uint256 c2_fp) alphaConfig, address resolver)",
  MARKET_CREATED_V1: "event MarketCreatedV1(uint256 indexed marketId, address indexed market, address indexed creator, uint8 versionId, uint40 startsAt, uint40 expiresAt, address collateralToken, uint8 outcomeCount, uint128 initialSharesPerOutcome, uint16 creatorFeeBps, string metaDataURI, (uint256 T0, uint256 alpha0Bps, uint256 T1, uint256 alpha1Bps, uint256 T2, uint256 alpha2Bps, uint256 c1_fp, uint256 c2_fp) alphaConfig, address resolver, uint8 marketType)",

  // emitted by the individual XOMarketV1 market contracts
  OUTCOME_TOKENS_BOUGHT: "event OutcomeTokensBought(address buyer, uint8 outcomeIndex, uint256 outcomeTokenId, uint256 amount, uint256 cost)",
  BATCH_OUTCOME_TOKENS_BOUGHT: "event BatchOutcomeTokensBought(address buyer, uint8[] outcomeIndices, uint256[] outcomeTokenIds, uint256[] amounts, uint256 totalCost)",
  OUTCOME_TOKENS_SOLD: "event OutcomeTokensSold(address seller, uint8 outcomeIndex, uint256 outcomeTokenId, uint256 amount, uint256 received)",
  BATCH_OUTCOME_TOKENS_SOLD: "event BatchOutcomeTokensSold(address seller, uint8[] outcomeIndices, uint256[] outcomeTokenIds, uint256[] amounts, uint256 totalReceived)",
  PROTOCOL_FEE_SENT: "event ProtocolFeeSent(address to, uint256 amount)",
  CREATOR_FEE_SENT: "event CreatorFeeSent(address to, uint256 amount)",
  RESOLVER_FEE_SENT: "event ResolverFeeSent(address to, uint256 amount)",
  USER_FEES_SENT: "event UserFeesSent(uint256 amount)",

  // one event per match, emitted after the maker-leg OrderFilled events
  ORDERS_MATCHED: "event OrdersMatched(bytes32 indexed takerOrderHash, address indexed takerOrderMaker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled)",
  FEE_CHARGED: "event FeeCharged(address indexed feeManager, address indexed payer, uint256 amount)",
  MARKET_CREATION_FEE_CHARGED: "event MarketCreationFeeCharged(bytes32 indexed conditionId, address indexed creator, address collateralToken, uint256 fee)",
};

const FEE_LABELS = {
  AMM_PROTOCOL: "AMM Protocol Fees",
  AMM_CREATOR: "AMM Creator Fees",
  AMM_RESOLVER: "AMM Resolver Fees",
  AMM_USER_REWARDS: "AMM User Fees",
  MARKET_CREATION: "Market Creation Fees",
};

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // map AMM market contract -> collateral decimals
  const marketCreationLogs = await options.getLogs({
    eventAbi: abi.MARKET_CREATED,
    target: contracts.AMM_FACTORY,
    fromBlock: AMM_FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });
  const marketCreationV1Logs = await options.getLogs({
    eventAbi: abi.MARKET_CREATED_V1,
    target: contracts.AMM_FACTORY,
    fromBlock: AMM_FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });

  const ammMarketDecimals: Record<string, number> = {};
  [...marketCreationLogs, ...marketCreationV1Logs].forEach((log: any) => {
    const decimals = COLLATERAL_DECIMALS[log.collateralToken.toLowerCase()];
    if (decimals !== undefined) ammMarketDecimals[log.market.toLowerCase()] = decimals;
  });

  // AMM trades: the collateral leg is cash volume, the share leg is notional
  const singleTrades = [
    { eventAbi: abi.OUTCOME_TOKENS_BOUGHT, cash: "cost" },
    { eventAbi: abi.OUTCOME_TOKENS_SOLD, cash: "received" },
  ];
  for (const { eventAbi, cash } of singleTrades) {
    const logs = await options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true });
    logs.forEach((log: any) => {
      const decimals = ammMarketDecimals[log.address.toLowerCase()];
      if (decimals === undefined) return;
      dailyVolume.addUSDValue(Number(log.args[cash]) / 10 ** decimals);
      dailyNotionalVolume.addUSDValue(Number(log.args.amount) / 10 ** decimals);
    });
  }

  const batchTrades = [
    { eventAbi: abi.BATCH_OUTCOME_TOKENS_BOUGHT, cash: "totalCost" },
    { eventAbi: abi.BATCH_OUTCOME_TOKENS_SOLD, cash: "totalReceived" },
  ];
  for (const { eventAbi, cash } of batchTrades) {
    const logs = await options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true });
    logs.forEach((log: any) => {
      const decimals = ammMarketDecimals[log.address.toLowerCase()];
      if (decimals === undefined) return;
      dailyVolume.addUSDValue(Number(log.args[cash]) / 10 ** decimals);
      log.args.amounts.forEach((amount: any) => dailyNotionalVolume.addUSDValue(Number(amount) / 10 ** decimals));
    });
  }

  // AMM fees, each transferred out separately by the market contracts
  const ammFees = [
    { eventAbi: abi.PROTOCOL_FEE_SENT, label: FEE_LABELS.AMM_PROTOCOL, toProtocol: true },
    { eventAbi: abi.CREATOR_FEE_SENT, label: FEE_LABELS.AMM_CREATOR, toProtocol: false },
    { eventAbi: abi.RESOLVER_FEE_SENT, label: FEE_LABELS.AMM_RESOLVER, toProtocol: false },
    { eventAbi: abi.USER_FEES_SENT, label: FEE_LABELS.AMM_USER_REWARDS, toProtocol: false },
  ];
  for (const { eventAbi, label, toProtocol } of ammFees) {
    const logs = await options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true });
    logs.forEach((log: any) => {
      const decimals = ammMarketDecimals[log.address.toLowerCase()];
      if (decimals === undefined) return;
      const amount = Number(log.args.amount) / 10 ** decimals;
      dailyFees.addUSDValue(amount, label);
      if (toProtocol) dailyRevenue.addUSDValue(amount, label);
      else dailySupplySideRevenue.addUSDValue(amount, label);
    });
  }

  // CLOB: OrdersMatched fires once per match, so no double counting across
  // the maker and taker OrderFilled legs. Asset id 0 is the collateral side.
  const ordersMatchedLogs = await options.getLogs({
    eventAbi: abi.ORDERS_MATCHED,
    targets: [contracts.CTF_EXCHANGE_RETIRED, contracts.CTF_EXCHANGE],
    flatten: true,
  });
  ordersMatchedLogs.forEach((log: any) => {
    const takerBuys = log.makerAssetId.toString() === "0";
    const cash = takerBuys ? log.makerAmountFilled : log.takerAmountFilled;
    const shares = takerBuys ? log.takerAmountFilled : log.makerAmountFilled;
    dailyVolume.addUSDValue(Number(cash) / 10 ** CLOB_DECIMALS);
    dailyNotionalVolume.addUSDValue(Number(shares) / 10 ** CLOB_DECIMALS);
  });

  // CLOB trading fees exist only on the current exchange generation
  const feeChargedLogs = await options.getLogs({
    eventAbi: abi.FEE_CHARGED,
    target: contracts.CTF_EXCHANGE,
  });
  feeChargedLogs.forEach((log: any) => {
    const amount = Number(log.amount) / 10 ** CLOB_DECIMALS;
    dailyFees.addUSDValue(amount, METRIC.TRADING_FEES);
    dailyRevenue.addUSDValue(amount, METRIC.TRADING_FEES);
  });

  // conviction market creation fees, paid to the treasury from the current generation onwards
  const creationFeeLogs = await options.getLogs({
    eventAbi: abi.MARKET_CREATION_FEE_CHARGED,
    target: contracts.CLOB_MARKET_MANAGER,
    entireLog: true,
    parseLog: true,
  });
  creationFeeLogs.forEach((log: any) => {
    if (Number(log.blockNumber) < CURRENT_EXCHANGE_FROM_BLOCK) return;
    const decimals = COLLATERAL_DECIMALS[log.args.collateralToken.toLowerCase()];
    if (decimals === undefined) return;
    const amount = Number(log.args.fee) / 10 ** decimals;
    dailyFees.addUSDValue(amount, FEE_LABELS.MARKET_CREATION);
    dailyRevenue.addUSDValue(amount, FEE_LABELS.MARKET_CREATION);
  });

  return {
    dailyVolume,
    dailyNotionalVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "USD collateral value of every trade on the LMSR/AMM markets (buy cost and sell proceeds) and the CLOB orderbook (collateral leg of each match, counted once per match via OrdersMatched).",
  NotionalVolume: "Number of outcome shares traded, valued at their $1 settlement face value and counted once per trade.",
  Fees: "AMM markets charge protocol, creator, user and resolver fees on trades and resolution. The CLOB charges trading fees on fills (current exchange generation only) and a creation fee on conviction markets.",
  Revenue: "CLOB trading fees, conviction market creation fees and the protocol's share of AMM fees.",
  ProtocolRevenue: "CLOB trading fees, conviction market creation fees and the protocol's share of AMM fees.",
  SupplySideRevenue: "AMM fees paid out to market creators, resolvers and the user fee handler.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees charged on CLOB order fills, on the current exchange generation",
    [FEE_LABELS.MARKET_CREATION]: "Fees paid to the treasury when a conviction market is created",
    [FEE_LABELS.AMM_PROTOCOL]: "Protocol fees charged on AMM market trades",
    [FEE_LABELS.AMM_CREATOR]: "Fees paid to market creators on AMM market trades",
    [FEE_LABELS.AMM_RESOLVER]: "Fees paid to resolvers when an AMM market resolves",
    [FEE_LABELS.AMM_USER_REWARDS]: "Fees sent to the XO fee handler for user distributions on AMM market trades",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Fees charged on CLOB order fills, on the current exchange generation",
    [FEE_LABELS.MARKET_CREATION]: "Fees paid to the treasury when a conviction market is created",
    [FEE_LABELS.AMM_PROTOCOL]: "Protocol fees charged on AMM market trades",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Fees charged on CLOB order fills, on the current exchange generation",
    [FEE_LABELS.MARKET_CREATION]: "Fees paid to the treasury when a conviction market is created",
    [FEE_LABELS.AMM_PROTOCOL]: "Protocol fees charged on AMM market trades",
  },
  SupplySideRevenue: {
    [FEE_LABELS.AMM_CREATOR]: "Fees paid to market creators on AMM market trades",
    [FEE_LABELS.AMM_RESOLVER]: "Fees paid to resolvers when an AMM market resolves",
    [FEE_LABELS.AMM_USER_REWARDS]: "Fees sent to the XO fee handler for user distributions on AMM market trades",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.XO],
  start: "2025-11-05",
  methodology,
  breakdownMethodology,
};

export default adapter;
