import { ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryClickhouse } from "../helpers/indexer";
import { addTokensReceived } from "../helpers/token";

const NATIVE_TOKEN = ADDRESSES.null;
const TREASURY_RECEIVED = "Treasury Received";

// Source: https://docs.flap.sh/flap/developers/deployed-contract-addresses
const chainConfig: Record<string, { start: string; portal: string; fromBlock: number; useIndexer?: boolean, safe: string }> = {
  [CHAIN.BSC]: {
    start: "2024-06-27",
    portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
    fromBlock: 39980228,
    useIndexer: true,
    safe: "0x8a08D98CBB218fceB318Ecf3aBc1BA43D8A7aB0E",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-08",
    portal: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    fromBlock: 4180724,
    safe: "0xa4A727E0918cf9B39639Fc4cB7D742d39C5352a4",
  },
  [CHAIN.XLAYER]: {
    start: "2025-08-18",
    portal: "0xb30D8c4216E1f21F27444D2FfAee3ad577808678",
    fromBlock: 31165559,
    useIndexer: true,
    safe: "0xAC4f9Ba4E48cAafBa17164FBCb078091651Ae361",
  },
  [CHAIN.MONAD]: {
    start: "2025-10-30",
    portal: "0x30e8ee7b5881bf2E158A0514f2150aabe2c68b23",
    fromBlock: 32284042,
    useIndexer: true,
    safe: "0xA77dc19CF7CB7ab50b661Ce5AB6D37954F8022f4",
  },
};

const eventAbis = {
  tokenBought: "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenSold: "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenQuoteSet: "event TokenQuoteSet(address token, address quoteToken)",
  safeReceived: "event SafeReceived(address indexed sender, uint256 value)",
};

const TOKEN_BOUGHT_TOPIC0 = "0xa800a2038683844fac66747f771bfdfae862eb28b16bcfa387afa9fbacce8ff7";
const TOKEN_SOLD_TOPIC0 = "0x03a4693e592f5e75dc7c136acb39b146d2b4966c0e509c34f362dee02b3b861a";
const TOKEN_QUOTE_SET_TOPIC0 = "0x3ceb902d3c555c21c3415b6aa839104b18e4825b2f8324011ff979089a507a8c";
const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SAFE_RECEIVED_TOPIC0 = "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d";

// The portal is an upgradeable proxy; getTokenV8Safe is the version-safe lens
// over token state (enums returned as uint8, works for tokens of every version).
const getTokenV8SafeAbi = "function getTokenV8Safe(address) view returns ((uint8 status, uint256 reserve, uint256 circulatingSupply, uint256 price, uint8 tokenVersion, uint256 r, uint256 h, uint256 k, uint256 dexSupplyThresh, address quoteTokenAddress, bool nativeToQuoteSwapEnabled, bytes32 extensionID, uint256 buyTaxRate, uint256 sellTaxRate, address pool, uint256 progress, uint8 lpFeeProfile, uint8 dexId))";

const shortAddrOf = (addr: string) => addr.substring(0, 10).toLowerCase();
const padAddress = (addr: string) => "0x" + "0".repeat(24) + addr.slice(2).toLowerCase();

const BLOCKS_PER_BATCH = 10000;

type TradeTotals = {
  volumeByToken: Record<string, string | bigint>;
  quoteByToken: Record<string, string>;
  // every quote token ever configured, for tracking fee-safe inflows
  quoteTokens: string[];
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
      toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 259, 64)))))) AS volume
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
  trades.forEach((row: any) => { volumeByToken[row.token] = row.volume; });

  // No time filter on either quote query: quotes are set once at creation and never change.
  const distinctQuotes = await queryClickhouse<any>(`
    SELECT DISTINCT concat('0x', substring(data, 91, 40)) AS quote
    FROM evm_indexer.logs
    PREWHERE chain = ${chainId}
      AND short_address = '${shortAddrOf(target)}'
      AND short_topic0 = '${TOKEN_QUOTE_SET_TOPIC0.substring(0, 10)}'
      AND address = '${target}'
      AND topic0 = '${TOKEN_QUOTE_SET_TOPIC0}'
  `);
  const quoteTokens = distinctQuotes.map((row: any) => row.quote);

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

  return { volumeByToken, quoteByToken, quoteTokens };
};

const getTradesFromLogs = async (options: FetchOptions, portal: string): Promise<TradeTotals> => {
  const [dayFromBlock, dayToBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  const volumeByToken: Record<string, bigint> = {};
  const processTradeLogs = (logs: any[]) => {
    logs.forEach((log) => {
      const token = log.token.toLowerCase();
      volumeByToken[token] = (volumeByToken[token] ?? 0n) + BigInt(log.eth);
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

  // Resolve quotes from portal state at the latest block. Batches run
  // sequentially with a pause to avoid RPC rate limits
  const tokens = Object.keys(volumeByToken);
  const quoteByToken: Record<string, string> = {};
  const latestApi = new ChainApi({ chain: options.chain });
  const MULTICALL_BATCH = 500;
  for (let i = 0; i < tokens.length; i += MULTICALL_BATCH) {
    const batch = tokens.slice(i, i + MULTICALL_BATCH);
    const tokenStates = await latestApi.multiCall({
      target: portal,
      abi: getTokenV8SafeAbi,
      calls: batch,
      chunkSize: MULTICALL_BATCH,
    } as any);
    batch.forEach((token, j) => {
      const quote = tokenStates[j]?.quoteTokenAddress?.toLowerCase();
      if (quote) quoteByToken[token] = quote;
    });
    if (i + MULTICALL_BATCH < tokens.length) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const quoteTokens = [...new Set(Object.values(quoteByToken))];

  return { volumeByToken, quoteByToken, quoteTokens };
};

// Safe inflows via ClickHouse: ERC20 Transfer events on the quote tokens with
// the Safe as recipient (topic2), plus native via SafeReceived on the Safe.
// Sums are computed server-side, one row per quote token comes back.
const addSafeInflowsFromIndexer = async (options: FetchOptions, safe: string, erc20Quotes: string[], balances: any) => {
  const chainId = Number(options.api.chainId);
  const target = safe.toLowerCase();
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  if (erc20Quotes.length) {
    const shortList = [...new Set(erc20Quotes.map(shortAddrOf))].map((a) => `'${a}'`).join(",");
    const addressList = erc20Quotes.map((a) => `'${a.toLowerCase()}'`).join(",");
    const transfers = await queryClickhouse<any>(`
      SELECT
        address AS token,
        toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 3, 64)))))) AS amount
      FROM evm_indexer.logs
      PREWHERE chain = ${chainId}
        AND short_address IN (${shortList})
        AND short_topic0 = '${TRANSFER_TOPIC0.substring(0, 10)}'
        AND address IN (${addressList})
        AND topic0 = '${TRANSFER_TOPIC0}'
        AND topic2 = '${padAddress(target)}'
        AND block_number >= ${fromBlock}
        AND block_number <= ${toBlock}
      GROUP BY address
    `);
    transfers.forEach((row: any) => balances.add(row.token, row.amount, TREASURY_RECEIVED));
  }

  const native = await queryClickhouse<any>(`
    SELECT toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 3, 64)))))) AS amount
    FROM evm_indexer.logs
    PREWHERE chain = ${chainId}
      AND short_address = '${shortAddrOf(target)}'
      AND short_topic0 = '${SAFE_RECEIVED_TOPIC0.substring(0, 10)}'
      AND address = '${target}'
      AND topic0 = '${SAFE_RECEIVED_TOPIC0}'
      AND block_number >= ${fromBlock}
      AND block_number <= ${toBlock}
  `);
  if (native.length && native[0].amount !== "0") balances.addGasToken(native[0].amount, TREASURY_RECEIVED);
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { portal, useIndexer, safe } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const { volumeByToken, quoteByToken, quoteTokens } = useIndexer
    ? await getTradesFromIndexer(options, portal)
    : await getTradesFromLogs(options, portal);

  Object.keys(volumeByToken).forEach((token) => {
    const quoteToken = quoteByToken[token];
    if (!quoteToken) return;
    if (quoteToken === NATIVE_TOKEN) dailyVolume.addGasToken(volumeByToken[token]);
    else dailyVolume.add(quoteToken, volumeByToken[token]);
  });

  // Fees: every quote-token inflow to the Flap fee Safe, from any sender
  // bonding-curve fees, token-tax payouts, graduation fees and LP fee claims
  // all settle there.
  const erc20Quotes = quoteTokens.filter((token) => token !== NATIVE_TOKEN);
  if (useIndexer) {
    await addSafeInflowsFromIndexer(options, safe, erc20Quotes, dailyFees);
  } else {
    const erc20Transfers = await addTokensReceived({ options, target: safe, tokens: erc20Quotes });
    dailyFees.addBalances(erc20Transfers, TREASURY_RECEIVED);
    const nativeLogs = await options.getLogs({ target: safe, eventAbi: eventAbis.safeReceived });
    nativeLogs.forEach((log: any) => dailyFees.addGasToken(log.value, TREASURY_RECEIVED));
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Volume: "Buy and sell volume on Flap bonding curves before tokens move to a DEX.",
  Fees: "All quote tokens received by the Flap fee Safe, from any sender. Includes bonding-curve fees, token-tax payouts, graduation fees, and other quote inflows such as airdrops.",
  UserFees: "Same as Fees — all quote inflows to the fee Safe.",
  Revenue: "All quote tokens received by the Flap fee Safe, from any sender.",
  ProtocolRevenue: "All quote tokens received by the Flap fee Safe, from any sender.",
};

const breakdownMethodology = {
  Fees: {
    [TREASURY_RECEIVED]: "Quote tokens transferred to the Flap fee Safe (native SafeReceived and ERC20 Transfer to the Safe), with no sender filter.",
  },
  UserFees: {
    [TREASURY_RECEIVED]: "Quote tokens transferred to the Flap fee Safe (native SafeReceived and ERC20 Transfer to the Safe), with no sender filter.",
  },
  Revenue: {
    [TREASURY_RECEIVED]: "Quote tokens received by the Flap fee Safe.",
  },
  ProtocolRevenue: {
    [TREASURY_RECEIVED]: "Quote tokens received by the Flap fee Safe.",
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
