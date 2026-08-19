import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryClickhouse } from "../helpers/indexer";

const BONDING_CURVE_FEES = "Bonding Curve Fees";
const NATIVE_TOKEN = ADDRESSES.null;

// Source: https://docs.flap.sh/flap/developers/deployed-contract-addresses
const chainConfig: Record<string, { start: string; portal: string; fromBlock: number; useIndexer?: boolean }> = {
  [CHAIN.BSC]: {
    start: "2024-06-27",
    portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
    fromBlock: 39980228,
    useIndexer: true,
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-08",
    portal: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    fromBlock: 4180724,
  },
  [CHAIN.XLAYER]: {
    start: "2025-08-18",
    portal: "0xb30D8c4216E1f21F27444D2FfAee3ad577808678",
    fromBlock: 31165559,
    useIndexer: true,
  },
  [CHAIN.MONAD]: {
    start: "2025-10-30",
    portal: "0x30e8ee7b5881bf2E158A0514f2150aabe2c68b23",
    fromBlock: 32284042,
    useIndexer: true,
  },
};

const eventAbis = {
  tokenBought: "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenSold: "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenQuoteSet: "event TokenQuoteSet(address token, address quoteToken)",
};

const TOKEN_BOUGHT_TOPIC0 = "0xa800a2038683844fac66747f771bfdfae862eb28b16bcfa387afa9fbacce8ff7";
const TOKEN_SOLD_TOPIC0 = "0x03a4693e592f5e75dc7c136acb39b146d2b4966c0e509c34f362dee02b3b861a";
const TOKEN_QUOTE_SET_TOPIC0 = "0x3ceb902d3c555c21c3415b6aa839104b18e4825b2f8324011ff979089a507a8c";

const shortAddrOf = (addr: string) => addr.substring(0, 10).toLowerCase();

const BLOCKS_PER_BATCH = 10000;

type TradeTotals = {
  volumeByToken: Record<string, string | bigint>;
  feesByToken: Record<string, string | bigint>;
  quoteByToken: Record<string, string>;
};

// ClickHouse path: aggregate the day's trades per token server-side, then map
// each traded token to its quote via the full-history TokenQuoteSet logs
// TokenBought and TokenSold share the same data layout:
// ts | token | actor | amount | eth | fee | postPrice
const getTradesFromIndexer = async (options: FetchOptions, portal: string): Promise<TradeTotals> => {
  const chainId = Number(options.api.chainId);
  const target = portal.toLowerCase();
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  const trades = await queryClickhouse<any>(`
    SELECT
      concat('0x', substring(data, 91, 40)) AS token,
      toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 259, 64)))))) AS volume,
      toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 323, 64)))))) AS fees
    FROM evm_indexer.logs
    PREWHERE chain = ${chainId}
      AND short_address = '${shortAddrOf(target)}'
      AND short_topic0 IN ('${TOKEN_BOUGHT_TOPIC0.substring(0, 10)}', '${TOKEN_SOLD_TOPIC0.substring(0, 10)}')
      AND address = '${target}'
      AND topic0 IN ('${TOKEN_BOUGHT_TOPIC0}', '${TOKEN_SOLD_TOPIC0}')
      AND block_number >= ${fromBlock}
      AND block_number <= ${toBlock}
    GROUP BY token
  `);

  const volumeByToken: Record<string, string> = {};
  const feesByToken: Record<string, string> = {};
  trades.forEach((row: any) => {
    volumeByToken[row.token] = row.volume;
    feesByToken[row.token] = row.fees;
  });

  // No time filter: quotes are set once at creation and never change.
  const quoteByToken: Record<string, string> = {};
  if (trades.length) {
    const tokenList = trades.map((row: any) => `'${row.token.slice(2)}'`).join(",");
    const quotes = await queryClickhouse<any>(`
      SELECT
        concat('0x', substring(data, 27, 40)) AS token,
        concat('0x', substring(data, 91, 40)) AS quote
      FROM evm_indexer.logs
      PREWHERE chain = ${chainId}
        AND short_address = '${shortAddrOf(target)}'
        AND short_topic0 = '${TOKEN_QUOTE_SET_TOPIC0.substring(0, 10)}'
        AND address = '${target}'
        AND topic0 = '${TOKEN_QUOTE_SET_TOPIC0}'
        AND substring(data, 27, 40) IN (${tokenList})
    `, undefined, { max_query_size: 4194304 });
    quotes.forEach((row: any) => { quoteByToken[row.token] = row.quote; });
  }

  return { volumeByToken, feesByToken, quoteByToken };
};

const getTradesFromLogs = async (options: FetchOptions, portal: string, fromBlock: number): Promise<TradeTotals> => {
  const [dayFromBlock, dayToBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  // Map every token to its quote token once. TokenQuoteSet fires once per token
  // at creation, so this is fetched over the full history and cached in cloud.
  const quoteLogs = await options.getLogs({
    target: portal,
    eventAbi: eventAbis.tokenQuoteSet,
    fromBlock,
    toBlock: dayToBlock,
    cacheInCloud: true,
  });
  const quoteByToken: Record<string, string> = {};
  quoteLogs.forEach((log: any) => { quoteByToken[log.token.toLowerCase()] = log.quoteToken.toLowerCase(); });

  const volumeByToken: Record<string, bigint> = {};
  const feesByToken: Record<string, bigint> = {};
  const processTradeLogs = (logs: any[]) => {
    logs.forEach((log) => {
      const token = log.token.toLowerCase();
      volumeByToken[token] = (volumeByToken[token] ?? 0n) + BigInt(log.eth);
      feesByToken[token] = (feesByToken[token] ?? 0n) + BigInt(log.fee);
    });
  };

  // Fetch buy/sell logs in block-range batches and aggregate incrementally
  // instead of loading the whole day's logs into memory at once. A single
  // getLogs for the full window OOMs on busy days; batching bounds peak memory
  // to one batch since each decoded array is released before the next fetch.
  for (let start = dayFromBlock; start <= dayToBlock; start += BLOCKS_PER_BATCH) {
    const end = Math.min(start + BLOCKS_PER_BATCH - 1, dayToBlock);
    const [buyLogs, sellLogs] = await Promise.all([
      options.getLogs({ target: portal, eventAbi: eventAbis.tokenBought, fromBlock: start, toBlock: end, skipCacheRead: true }),
      options.getLogs({ target: portal, eventAbi: eventAbis.tokenSold, fromBlock: start, toBlock: end, skipCacheRead: true }),
    ]);
    processTradeLogs(buyLogs);
    processTradeLogs(sellLogs);
  }

  return { volumeByToken, feesByToken, quoteByToken };
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { portal, fromBlock, useIndexer } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const { volumeByToken, feesByToken, quoteByToken } = useIndexer
    ? await getTradesFromIndexer(options, portal)
    : await getTradesFromLogs(options, portal, fromBlock);

  Object.keys(volumeByToken).forEach((token) => {
    const quoteToken = quoteByToken[token]
    if (!quoteToken) return;
    if (quoteToken === NATIVE_TOKEN) {
      dailyVolume.addGasToken(volumeByToken[token]);
      dailyFees.addGasToken(feesByToken[token], BONDING_CURVE_FEES);
      dailyRevenue.addGasToken(feesByToken[token], BONDING_CURVE_FEES);
      dailyProtocolRevenue.addGasToken(feesByToken[token], BONDING_CURVE_FEES);
    } else {
      dailyVolume.add(quoteToken, volumeByToken[token]);
      dailyFees.add(quoteToken, feesByToken[token], BONDING_CURVE_FEES);
      dailyRevenue.add(quoteToken, feesByToken[token], BONDING_CURVE_FEES);
      dailyProtocolRevenue.add(quoteToken, feesByToken[token], BONDING_CURVE_FEES);
    }
  });

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Volume: "Buy and sell volume on Flap bonding curves before tokens move to a DEX.",
  Fees: "Fees users pay on Flap bonding-curve buys and sells. Token taxes are excluded.",
  UserFees: "Fees users pay on Flap bonding-curve buys and sells.",
  Revenue: "Fees kept by Flap from bonding-curve trades.",
  ProtocolRevenue: "Fees kept by Flap from bonding-curve trades.",
};

const breakdownMethodology = {
  Fees: {
    [BONDING_CURVE_FEES]: "Fees users pay on Flap bonding-curve buys and sells.",
  },
  UserFees: {
    [BONDING_CURVE_FEES]: "Fees users pay on Flap bonding-curve buys and sells.",
  },
  Revenue: {
    [BONDING_CURVE_FEES]: "Fees kept by Flap from bonding-curve trades.",
  },
  ProtocolRevenue: {
    [BONDING_CURVE_FEES]: "Fees kept by Flap from bonding-curve trades.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;