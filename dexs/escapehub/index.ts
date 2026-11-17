import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { timeFilter, u64, u8 } from "../../helpers/alliumSolanaEvents";

const CURVE_PROGRAM = "EscapeCu75SSPg24kyh7R6NvwgMUT8QEpCLY6kKHYCeD"; // https://solscan.io/account/EscapeCu75SSPg24kyh7R6NvwgMUT8QEpCLY6kKHYCeD
const FEE_PROGRAM = "EscapeFezQneK4bXRhcaBW19qQNj2xLJpaJX9pouM6C1"; // https://solscan.io/account/EscapeFezQneK4bXRhcaBW19qQNj2xLJpaJX9pouM6C1

// event data: emit_cpi tag (8 bytes) + event discriminator (8 bytes) + Borsh-encoded event
const EVENT_CPI_TAG = "e445a52e51cb9a1d";
// u64: sol_amount @81, fee @97
const TRADE_EVENT = "bddb7fd34ee661ee";
const TRADE_EVENT_LENGTH = 129; // 16 + 113 bytes of event
// u8: source @80 (0 curve, 1 escapeswap), routing @81 (0 cashback, 1 sharing); u64: amount @82
const CREATOR_FEE_DEPOSITED = "ce8820587791f4c2";
const CREATOR_FEE_DEPOSITED_MIN_LENGTH = 114; // 16 + 98 bytes, the shortest encoding of the event
const SOURCE_CURVE = "00";
export const SOURCE_ESCAPESWAP = "01";
const ROUTING_CASHBACK = "00";

export const creatorFeesSql = (options: FetchOptions, source: string) => `
  SELECT
    COALESCE(SUM(IFF(${u8("data_hex", 81)} = '${ROUTING_CASHBACK}', ${u64("data_hex", 82)}, 0)), 0) AS cashback,
    COALESCE(SUM(IFF(${u8("data_hex", 81)} <> '${ROUTING_CASHBACK}', ${u64("data_hex", 82)}, 0)), 0) AS creator,
    COUNT_IF(LENGTH(data_hex) / 2 < ${CREATOR_FEE_DEPOSITED_MIN_LENGTH}) AS deposit_unknown_layout
  FROM solana.raw.inner_instructions
  WHERE program_id = '${FEE_PROGRAM}'
    AND parent_tx_success
    AND ${timeFilter(options)}
    AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'
    AND SUBSTR(data_hex, 17, 16) = '${CREATOR_FEE_DEPOSITED}'
    AND ${u8("data_hex", 80)} = '${source}'`;

// The window is complete in Allium once it holds Solana transfers from right after it.
// Solana has transfers every second, so 15 minutes always has some and keeps this lookup small.
const INDEXED_LOOKAHEAD_SECONDS = 15 * 60;

export const indexedSql = (options: FetchOptions) => `
  SELECT EXISTS (SELECT 1 FROM solana.assets.transfers
    WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + INDEXED_LOOKAHEAD_SECONDS})) AS indexed`;

async function fetchSolana(options: FetchOptions) {
  const [rows] = await queryAllium(`
    WITH trades AS (
      SELECT
        COALESCE(SUM(${u64("data_hex", 81)} + ${u64("data_hex", 97)}), 0) AS volume,
        COALESCE(SUM(${u64("data_hex", 97)}), 0) AS fee,
        COUNT(*) AS trades,
        COUNT_IF(LENGTH(data_hex) / 2 <> ${TRADE_EVENT_LENGTH}) AS unknown_layout
      FROM solana.raw.inner_instructions
      WHERE program_id = '${CURVE_PROGRAM}'
        AND parent_tx_success
        AND ${timeFilter(options)}
        AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'
        AND SUBSTR(data_hex, 17, 16) = '${TRADE_EVENT}'
    ),
    creator AS (${creatorFeesSql(options, SOURCE_CURVE)}),
    checks AS (${indexedSql(options)})
    SELECT t.volume, t.fee, t.trades, t.unknown_layout, c.cashback, c.creator, c.deposit_unknown_layout, k.indexed
    FROM trades t, creator c, checks k
  `);
  if (!rows) throw new Error("escapehub: empty Allium response");
  if (!rows.indexed) throw new Error(`escapehub: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(rows.unknown_layout) > 0) throw new Error(`escapehub: ${rows.unknown_layout} trade events with unknown layout`);
  if (Number(rows.deposit_unknown_layout) > 0) throw new Error(`escapehub: ${rows.deposit_unknown_layout} creator fee events with unknown layout`);

  const fee = BigInt(rows.fee);
  const cashback = BigInt(rows.cashback);
  const creator = BigInt(rows.creator);
  // 0.50% of 1.20%
  const gap = cashback + creator - (fee * 5n) / 12n;
  // each trade rounds its fee split to whole lamports: up to 1 per trade, plus 1 for the division above
  const tolerance = BigInt(rows.trades) + 1n;
  if (gap > tolerance || -gap > tolerance)
    throw new Error(`escapehub: creator fee mismatch ${cashback + creator} vs ${fee}`);

  return { volume: BigInt(rows.volume), protocol: fee - cashback - creator, creator, cashback };
}

const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed market, address indexed creator, string name, string symbol, string metadataURI, uint256 virtualNativeOffset)";
const TOKEN_FEE_ROUTING = "event TokenFeeRouting(address indexed token, uint8 routing, address indexed feeDestination)";
const BUY =
  "event Buy(address indexed token, address indexed buyer, uint256 ethInGross, uint256 ethInNet, uint256 protocolFee, uint256 creatorFee, uint256 tokensOut, uint256 newPrice, uint256 newRealEth, uint256 newRemaining, uint256 timestamp)";
const SELL =
  "event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 ethOutGross, uint256 ethOutNet, uint256 protocolFee, uint256 creatorFee, uint256 newPrice, uint256 newRealEth, uint256 newRemaining, uint256 timestamp)";
const SWAP_WITH_FEE =
  "event SwapWithFee(bytes32 indexed poolId, address indexed token, address indexed sender, uint256 inputAmount, uint256 feeAmount, uint256 protocolFee, uint256 creatorFee)";

export const SOLANA_START = "2026-11-14";

type ChainConfig = { start: string; factory?: string; hook?: string; fromBlock?: number; weth?: string };
export const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.SOLANA]: { start: SOLANA_START },
  [CHAIN.BASE]: {
    start: "2026-11-15",
    factory: "0x99Feb0E3d5Ba40eB5DF8D914f5A06370CaE5CA6E", // https://basescan.org/address/0x99Feb0E3d5Ba40eB5DF8D914f5A06370CaE5CA6E
    hook: "0x02B9F879b64958EAe4B4703668376F9eF42528CC", // https://basescan.org/address/0x02B9F879b64958EAe4B4703668376F9eF42528CC
    fromBlock: 57899403, // block the factory was deployed in
    weth: ADDRESSES.base.WETH,
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-11-15",
    factory: "0x99Feb0E3d5Ba40eB5DF8D914f5A06370CaE5CA6E", // https://robinhoodchain.blockscout.com/address/0x99Feb0E3d5Ba40eB5DF8D914f5A06370CaE5CA6E
    hook: "0x5F49F1E00F805A9038117D702a74EE3E0eA068cC", // https://robinhoodchain.blockscout.com/address/0x5F49F1E00F805A9038117D702a74EE3E0eA068cC
    fromBlock: 115197467, // block of the deployment's first contract creation; the factory is not older
    weth: ADDRESSES.robinhood.WETH,
  },
};

async function fetchEvm(options: FetchOptions) {
  const { factory, hook, fromBlock, weth } = chainConfig[options.chain] as Required<ChainConfig>;
  const [created, routings] = await Promise.all([
    options.getLogs({ target: factory, eventAbi: TOKEN_CREATED, fromBlock, cacheInCloud: true }),
    options.getLogs({ target: factory, eventAbi: TOKEN_FEE_ROUTING, fromBlock, cacheInCloud: true }),
  ]);
  const markets = created.map((log: any) => log.market);
  const cashbackCoins = new Set(routings.filter((log: any) => Number(log.routing) === 0).map((log: any) => log.token.toLowerCase()));

  const [buys, sells, hookFees] = await Promise.all([
    markets.length ? options.getLogs({ targets: markets, eventAbi: BUY }) : [],
    markets.length ? options.getLogs({ targets: markets, eventAbi: SELL }) : [],
    options.getLogs({ target: hook, eventAbi: SWAP_WITH_FEE }),
  ]);

  let volume = 0n, protocol = 0n, creator = 0n, cashback = 0n;
  let poolProtocol = 0n, poolCreator = 0n, poolCashback = 0n;
  const addCurveFees = (log: any) => {
    protocol += BigInt(log.protocolFee);
    if (cashbackCoins.has(log.token.toLowerCase())) cashback += BigInt(log.creatorFee);
    else creator += BigInt(log.creatorFee);
  };
  for (const log of buys) {
    volume += BigInt(log.ethInGross);
    addCurveFees(log);
  }
  for (const log of sells) {
    volume += BigInt(log.ethOutGross);
    addCurveFees(log);
  }
  for (const log of hookFees) {
    poolProtocol += BigInt(log.protocolFee);
    if (cashbackCoins.has(log.token.toLowerCase())) poolCashback += BigInt(log.creatorFee);
    else poolCreator += BigInt(log.creatorFee);
  }
  return { volume, protocol, creator, cashback, poolProtocol, poolCreator, poolCashback, weth };
}

const LABELS = {
  CurveFees: "Bonding Curve Fees",
  PoolFees: "Graduated Pool Fees",
  CurveProtocol: "Bonding Curve Fees To Protocol",
  CurveCreator: "Bonding Curve Fees To Creators",
  CurveCashback: "Bonding Curve Cashback To Traders",
  PoolProtocol: "Graduated Pool Fees To Protocol",
  PoolCreator: "Graduated Pool Fees To Creators",
  PoolCashback: "Graduated Pool Cashback To Traders",
};

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    const SOL = ADDRESSES.solana.SOL;
    const s = await fetchSolana(options);
    dailyVolume.add(SOL, s.volume);
    dailyFees.add(SOL, s.protocol + s.creator + s.cashback, LABELS.CurveFees);
    dailyRevenue.add(SOL, s.protocol, LABELS.CurveProtocol);
    dailySupplySideRevenue.add(SOL, s.creator, LABELS.CurveCreator);
    dailySupplySideRevenue.add(SOL, s.cashback, LABELS.CurveCashback);
  } else {
    const e = await fetchEvm(options);
    dailyVolume.addGasToken(e.volume);
    dailyFees.addGasToken(e.protocol + e.creator + e.cashback, LABELS.CurveFees);
    dailyFees.add(e.weth, e.poolProtocol + e.poolCreator + e.poolCashback, LABELS.PoolFees);
    dailyRevenue.addGasToken(e.protocol, LABELS.CurveProtocol);
    dailyRevenue.add(e.weth, e.poolProtocol, LABELS.PoolProtocol);
    dailySupplySideRevenue.addGasToken(e.creator, LABELS.CurveCreator);
    dailySupplySideRevenue.addGasToken(e.cashback, LABELS.CurveCashback);
    dailySupplySideRevenue.add(e.weth, e.poolCreator, LABELS.PoolCreator);
    dailySupplySideRevenue.add(e.weth, e.poolCashback, LABELS.PoolCashback);
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

const methodology = {
  Volume: "SOL / ETH side of every buy and sell on EscapeHub bonding curves, fees included. Trades after graduation are not included.",
  Fees: "Bonding curve trading fees (1.20%) and fees on graduated Uniswap v4 pools taken by the EscapeHub hook (Base, Robinhood).",
  UserFees: "Bonding curve trading fees (1.20%) and fees on graduated Uniswap v4 pools taken by the EscapeHub hook (Base, Robinhood).",
  Revenue: "Protocol share of trading fees.",
  ProtocolRevenue: "Protocol share of trading fees.",
  SupplySideRevenue: "Creator / cashback share of trading fees.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CurveFees]: "1.20% fee on every bonding curve buy and sell.",
    [LABELS.PoolFees]: "Fees taken by the EscapeHub hook on graduated Uniswap v4 pools (Base, Robinhood).",
  },
  UserFees: {
    [LABELS.CurveFees]: "1.20% fee on every bonding curve buy and sell.",
    [LABELS.PoolFees]: "Fees taken by the EscapeHub hook on graduated Uniswap v4 pools (Base, Robinhood).",
  },
  Revenue: {
    [LABELS.CurveProtocol]: "0.70% of every bonding curve trade.",
    [LABELS.PoolProtocol]: "Protocol share of graduated pool fees (Base, Robinhood).",
  },
  ProtocolRevenue: {
    [LABELS.CurveProtocol]: "0.70% of every bonding curve trade.",
    [LABELS.PoolProtocol]: "Protocol share of graduated pool fees (Base, Robinhood).",
  },
  SupplySideRevenue: {
    [LABELS.CurveCreator]: "0.50% of every bonding curve trade on Sharing tokens.",
    [LABELS.CurveCashback]: "0.50% of every bonding curve trade on Cashback tokens.",
    [LABELS.PoolCreator]: "Creator share of graduated pool fees on Sharing tokens (Base, Robinhood).",
    [LABELS.PoolCashback]: "Cashback share of graduated pool fees on Cashback tokens (Base, Robinhood).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
