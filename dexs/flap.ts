import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryClickhouse } from "../helpers/indexer";
import { addTokensReceived } from "../helpers/token";

const NATIVE_TOKEN = ADDRESSES.null;
const TAX_SENT_TO_BENEFICIARY_TOPIC = "0x94d400e2b2f0030dfd4795c238b520a1a9e2b6f32579af88b97b84e8ebf83ff5";
const DISPATCH_EXECUTED_TOPIC = "0x172485312163eefa9f05b438339dc7c596fbb24af0cb3e35b9130c68453a0d88";

const TREASURY_RECEIVED = "Treasury Received";
const TAX_TO_BENEFICIARY = "Token Tax to Beneficiary";
const TAX_TO_MARKET = "Token Tax to Market";
const TAX_TO_DIVIDENDS = "Token Tax to Dividends";

// Source: https://docs.flap.sh/flap/developers/deployed-contract-addresses
const chainConfig: Record<string, {
  start: string;
  portal: string;
  fromBlock: number;
  useIndexer?: boolean;
  safe: string;
  wrappedNative: string;
}> = {
  [CHAIN.BSC]: {
    start: "2024-06-27",
    portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
    fromBlock: 39980228,
    useIndexer: true,
    safe: "0x8a08D98CBB218fceB318Ecf3aBc1BA43D8A7aB0E",
    wrappedNative: ADDRESSES.bsc.WBNB,
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-08",
    portal: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09",
    fromBlock: 4180724,
    safe: "0xa4A727E0918cf9B39639Fc4cB7D742d39C5352a4",
    wrappedNative: ADDRESSES.robinhood.WETH,
  },
  [CHAIN.XLAYER]: {
    start: "2025-08-18",
    portal: "0xb30D8c4216E1f21F27444D2FfAee3ad577808678",
    fromBlock: 31165559,
    useIndexer: true,
    safe: "0xAC4f9Ba4E48cAafBa17164FBCb078091651Ae361",
    wrappedNative: ADDRESSES.xlayer.WOKB,
  },
  [CHAIN.MONAD]: {
    start: "2025-10-30",
    portal: "0x30e8ee7b5881bf2E158A0514f2150aabe2c68b23",
    fromBlock: 32284042,
    useIndexer: true,
    safe: "0xA77dc19CF7CB7ab50b661Ce5AB6D37954F8022f4",
    wrappedNative: ADDRESSES.monad.WMON,
  },
};

const eventAbis = {
  tokenBought: "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenSold: "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenQuoteSet: "event TokenQuoteSet(address token, address quoteToken)",
  transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  safeReceived: "event SafeReceived(address indexed sender, uint256 value)",
  taxSentToBeneficiary: "event TaxSentToBeneficiary(address beneficiary, uint256 amount)",
  dispatchExecuted: "event FlapTaxProcessorDispatchExecuted(address indexed taxToken, uint256 feeAmount, uint256 marketAmount, uint256 dividendAmount)",
};

const TOKEN_BOUGHT_TOPIC0 = "0xa800a2038683844fac66747f771bfdfae862eb28b16bcfa387afa9fbacce8ff7";
const TOKEN_SOLD_TOPIC0 = "0x03a4693e592f5e75dc7c136acb39b146d2b4966c0e509c34f362dee02b3b861a";
const TOKEN_QUOTE_SET_TOPIC0 = "0x3ceb902d3c555c21c3415b6aa839104b18e4825b2f8324011ff979089a507a8c";
const TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SAFE_RECEIVED_TOPIC0 = "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d";

const shortAddrOf = (addr: string) => addr.substring(0, 10).toLowerCase();
const padAddress = (addr: string) => "0x" + "0".repeat(24) + addr.slice(2).toLowerCase();
const uniqueLower = (addresses: string[]) =>
  [...new Set(addresses.map((a) => a.toLowerCase()).filter((a) => a && a !== NATIVE_TOKEN))];

const logAddress = (log: any) =>
  String(log.address ?? log.source ?? log.contractAddress ?? "").toLowerCase();

const logTxHash = (log: any) =>
  String(log.transactionHash ?? log.transaction_hash ?? "").toLowerCase();

const BLOCKS_PER_BATCH = 10000;

type TradeTotals = {
  volumeByToken: Record<string, string | bigint>;
  quoteByToken: Record<string, string>;
  // every quote token ever configured, for tracking fee-safe inflows
  quoteTokens: string[];
};

const resolveQuoteToken = (
  taxToken: string,
  quoteTokens: Record<string, string>,
  wrappedNative: string,
): string | null => {
  const quote = quoteTokens[taxToken.toLowerCase()];
  if (quote === undefined) return null;
  if (!quote || quote === NATIVE_TOKEN) return wrappedNative.toLowerCase();
  return quote.toLowerCase();
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

// Full taxToken → quoteToken map for SupplySide (all TokenQuoteSet, not only traded).
const getQuoteMapFromIndexer = async (options: FetchOptions, portal: string): Promise<Record<string, string>> => {
  const chainId = Number(options.api.chainId);
  const target = portal.toLowerCase();
  const rows = await queryClickhouse<any>(`
    SELECT
      concat('0x', substring(data, 27, 40)) AS token,
      concat('0x', substring(data, 91, 40)) AS quote
    FROM evm_indexer.logs
    PREWHERE chain = ${chainId}
      AND short_address = '${shortAddrOf(target)}'
      AND short_topic0 = '${TOKEN_QUOTE_SET_TOPIC0.substring(0, 10)}'
      AND address = '${target}'
      AND topic0 = '${TOKEN_QUOTE_SET_TOPIC0}'
  `, undefined, { max_query_size: 4194304 });
  const quoteByToken: Record<string, string> = {};
  rows.forEach((row: any) => { quoteByToken[row.token] = row.quote; });
  return quoteByToken;
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
  const quoteTokens = [...new Set(Object.values(quoteByToken))];

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

const fetchSupplySide = async (
  options: FetchOptions,
  config: (typeof chainConfig)[string],
  params: {
    erc20Quotes: string[];
    quoteTokens: Record<string, string>;
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) => {
  const { erc20Quotes, quoteTokens, dailyFees, dailySupplySideRevenue } = params;
  const { wrappedNative } = config;

  const addSupplySide = (token: string, amount: any, label: string) => {
    if (token === NATIVE_TOKEN) {
      dailySupplySideRevenue.addGasToken(amount, label);
      dailyFees.addGasToken(amount, label);
    } else {
      dailySupplySideRevenue.add(token, amount, label);
      dailyFees.add(token, amount, label);
    }
  };

  // Day-window topic scans only (same window as r5 data_start).
  const [beneficiaryLogs, dispatchLogs] = await Promise.all([
    options.getLogs({
      noTarget: true,
      eventAbi: eventAbis.taxSentToBeneficiary,
      topics: [TAX_SENT_TO_BENEFICIARY_TOPIC],
      entireLog: true,
      parseLog: true,
    }),
    options.getLogs({
      noTarget: true,
      eventAbi: eventAbis.dispatchExecuted,
      topics: [DISPATCH_EXECUTED_TOPIC],
      entireLog: true,
      parseLog: true,
    }),
  ]);

  if (beneficiaryLogs.length) {
    const splitters = uniqueLower(beneficiaryLogs.map(logAddress));
    const transferByKey = new Map<string, string>();

    if (splitters.length && erc20Quotes.length) {
      const fromTopic = splitters.length === 1 ? padAddress(splitters[0]) : splitters.map(padAddress);
      const transferLogs = await options.getLogs({
        targets: erc20Quotes,
        eventAbi: eventAbis.transfer,
        topics: [TRANSFER_TOPIC0, fromTopic as any, null as any],
        flatten: false,
      });

      transferLogs.forEach((tokenLogs: any[], i: number) => {
        const token = erc20Quotes[i];
        (tokenLogs || []).forEach((log: any) => {
          const tx = logTxHash(log);
          const from = String(log.from ?? log.args?.from ?? "").toLowerCase();
          const to = String(log.to ?? log.args?.to ?? "").toLowerCase();
          const value = log.value ?? log.args?.value;
          if (!tx || !from || !to || value === undefined) return;
          transferByKey.set(`${tx}:${from}:${to}:${BigInt(value).toString()}`, token);
        });
      });
    }

    beneficiaryLogs.forEach((log: any) => {
      const tx = logTxHash(log);
      const splitter = logAddress(log);
      const args = log.args ?? log;
      const beneficiary = String(args.beneficiary ?? "").toLowerCase();
      const amount = args.amount;
      if (!tx || !splitter || !beneficiary || amount === undefined) return;

      const token = transferByKey.get(`${tx}:${splitter}:${beneficiary}:${BigInt(amount).toString()}`);
      // No same-tx ERC20 Transfer → native payout (r5 ELSE → WBNB price).
      if (token) addSupplySide(token, amount, TAX_TO_BENEFICIARY);
      else addSupplySide(NATIVE_TOKEN, amount, TAX_TO_BENEFICIARY);
    });
  }

  dispatchLogs.forEach((log: any) => {
    const args = log.args ?? log;
    const taxToken = String(args.taxToken ?? "").toLowerCase();
    if (!taxToken) return;
    const quote = resolveQuoteToken(taxToken, quoteTokens, wrappedNative);
    if (!quote) return;
    const marketAmount = args.marketAmount;
    const dividendAmount = args.dividendAmount;
    if (marketAmount !== undefined && BigInt(marketAmount) > 0n) {
      addSupplySide(quote, marketAmount, TAX_TO_MARKET);
    }
    if (dividendAmount !== undefined && BigInt(dividendAmount) > 0n) {
      addSupplySide(quote, dividendAmount, TAX_TO_DIVIDENDS);
    }
  });
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const config = chainConfig[options.chain];
  const { portal, fromBlock, useIndexer, safe, wrappedNative } = config;
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { volumeByToken, quoteByToken, quoteTokens } = useIndexer
    ? await getTradesFromIndexer(options, portal)
    : await getTradesFromLogs(options, portal, fromBlock);

  Object.keys(volumeByToken).forEach((token) => {
    const quoteToken = quoteByToken[token];
    if (!quoteToken) return;
    if (quoteToken === NATIVE_TOKEN) dailyVolume.addGasToken(volumeByToken[token]);
    else dailyVolume.add(quoteToken, volumeByToken[token]);
  });

  // Fees/Revenue: every quote-token inflow to the Flap fee Safe, from any sender.
  // Union wrappedNative so TaxProcessor WBNB→Safe settles are included.
  const erc20Quotes = uniqueLower([
    ...quoteTokens.filter((token) => token !== NATIVE_TOKEN),
    wrappedNative,
  ]);
  if (useIndexer) {
    await addSafeInflowsFromIndexer(options, safe, erc20Quotes, dailyFees);
  } else {
    const erc20Transfers = await addTokensReceived({ options, target: safe, tokens: erc20Quotes });
    dailyFees.addBalances(erc20Transfers, TREASURY_RECEIVED);
    const nativeLogs = await options.getLogs({ target: safe, eventAbi: eventAbis.safeReceived });
    nativeLogs.forEach((log: any) => dailyFees.addGasToken(log.value, TREASURY_RECEIVED));
  }

  // Revenue = Safe inflows only (before SupplySide is added to dailyFees).
  dailyRevenue.addBalances(dailyFees);
  dailyProtocolRevenue.addBalances(dailyFees);

  const supplyQuoteMap = useIndexer
    ? await getQuoteMapFromIndexer(options, portal)
    : quoteByToken;

  await fetchSupplySide(options, config, {
    erc20Quotes,
    quoteTokens: supplyQuoteMap,
    dailyFees,
    dailySupplySideRevenue,
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Buy and sell volume on Flap bonding curves before tokens move to a DEX.",
  Fees: "Protocol revenue (quote tokens received by the Flap fee Safe, including wrapped-native transfers such as WBNB) plus token-tax amounts routed to marketing/vault recipients and token-holder dividends.",
  UserFees: "Same as Fees — all fees paid by traders and token-tax participants.",
  Revenue: "All quote tokens received by the Flap fee Safe, from any sender. Includes native SafeReceived and configured ERC20 quote transfers, plus wrapped-native (e.g. WBNB) transfers from TaxProcessor fee settlement.",
  ProtocolRevenue: "Same as Revenue — all quote inflows to the Flap fee Safe.",
  SupplySideRevenue: "Token tax routed outside the protocol Safe: V1 TaxSplitter beneficiary payouts, plus V2/V3 TaxProcessor market and dividend buckets.",
};

const breakdownMethodology = {
  Fees: {
    [TREASURY_RECEIVED]: "Quote tokens transferred to the Flap fee Safe (native SafeReceived and ERC20 Transfer to the Safe), with no sender filter.",
    [TAX_TO_BENEFICIARY]: "V1 token tax paid to TaxSplitter beneficiary addresses (TaxSentToBeneficiary).",
    [TAX_TO_MARKET]: "V2/V3 token tax market/vault bucket from TaxProcessor dispatch (marketAmount).",
    [TAX_TO_DIVIDENDS]: "V2/V3 token tax holder dividend bucket from TaxProcessor dispatch (dividendAmount).",
  },
  UserFees: {
    [TREASURY_RECEIVED]: "Quote tokens transferred to the Flap fee Safe (native SafeReceived and ERC20 Transfer to the Safe), with no sender filter.",
    [TAX_TO_BENEFICIARY]: "V1 token tax paid to TaxSplitter beneficiary addresses (TaxSentToBeneficiary).",
    [TAX_TO_MARKET]: "V2/V3 token tax market/vault bucket from TaxProcessor dispatch (marketAmount).",
    [TAX_TO_DIVIDENDS]: "V2/V3 token tax holder dividend bucket from TaxProcessor dispatch (dividendAmount).",
  },
  Revenue: {
    [TREASURY_RECEIVED]: "Quote tokens received by the Flap fee Safe.",
  },
  ProtocolRevenue: {
    [TREASURY_RECEIVED]: "Quote tokens received by the Flap fee Safe.",
  },
  SupplySideRevenue: {
    [TAX_TO_BENEFICIARY]: "V1 TaxSplitter payouts to configured beneficiary addresses.",
    [TAX_TO_MARKET]: "V2/V3 TaxProcessor market/vault payouts (DispatchExecuted.marketAmount).",
    [TAX_TO_DIVIDENDS]: "V2/V3 TaxProcessor holder dividends (DispatchExecuted.dividendAmount).",
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
