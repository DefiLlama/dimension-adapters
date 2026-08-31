import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";

const NATIVE_TOKEN = ADDRESSES.null;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const QUOTE_CONFIG_TOPIC = "0x9a1f38e55c729ebf0c45d240a00b09f0a79a715df7cfd6e8942bd3f8da839199";
// Flap-specific tax event topic0s (r5.sql)
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
  safe: string;
  wrappedNative: string;
}> = {
  [CHAIN.BSC]: {
    start: "2024-06-27",
    portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
    fromBlock: 39980228,
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
    safe: "0xAC4f9Ba4E48cAafBa17164FBCb078091651Ae361",
    wrappedNative: ADDRESSES.xlayer.WOKB,
  },
  [CHAIN.MONAD]: {
    start: "2025-10-30",
    portal: "0x30e8ee7b5881bf2E158A0514f2150aabe2c68b23",
    fromBlock: 32284042,
    safe: "0xA77dc19CF7CB7ab50b661Ce5AB6D37954F8022f4",
    wrappedNative: ADDRESSES.monad.WMON,
  },
};

const eventAbis = {
  tokenBought: "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenSold: "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenQuoteSet: "event TokenQuoteSet(address token, address quoteToken)",
  quoteTokenConfigurationSet: "event QuoteTokenConfigurationSet(address quoteToken, tuple(uint8 enabled, uint8 defaultCurve, uint8 alternativeCurve, uint8 nativeToQuoteSwapType, uint8 dexId) config)",
  transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  safeReceived: "event SafeReceived(address indexed sender, uint256 value)",
  taxSentToBeneficiary: "event TaxSentToBeneficiary(address beneficiary, uint256 amount)",
  dispatchExecuted: "event FlapTaxProcessorDispatchExecuted(address indexed taxToken, uint256 feeAmount, uint256 marketAmount, uint256 dividendAmount)",
};

const BLOCKS_PER_BATCH = 10000;

const addressFromDataWord = (data: string, wordIndex = 0) => {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const start = wordIndex * 64 + 24;
  return ("0x" + hex.slice(start, start + 40)).toLowerCase();
};

const uniqueLower = (addresses: string[]) =>
  [...new Set(addresses.map((a) => a.toLowerCase()).filter((a) => a && a !== NATIVE_TOKEN))];

const padAddress = (address: string) =>
  "0x" + address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");

const logAddress = (log: any) =>
  String(log.address ?? log.source ?? log.contractAddress ?? "").toLowerCase();

const logTxHash = (log: any) =>
  String(log.transactionHash ?? log.transaction_hash ?? "").toLowerCase();

const resolveQuoteToken = (
  taxToken: string,
  quoteTokens: Record<string, string>,
  wrappedNative: string,
) => {
  const quote = quoteTokens[taxToken.toLowerCase()];
  if (!quote || quote === NATIVE_TOKEN) return wrappedNative.toLowerCase();
  return quote.toLowerCase();
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

  // Day-window topic scans only (same window as r5 data_start). Flap event
  // signatures are unique enough that we do not need a separate contract-discovery pass.
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
        topics: [TRANSFER_TOPIC, fromTopic as any, null as any],
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
      if (token) addSupplySide(token, amount, TAX_TO_BENEFICIARY);
      else addSupplySide(NATIVE_TOKEN, amount, TAX_TO_BENEFICIARY);
    });
  }

  dispatchLogs.forEach((log: any) => {
    const args = log.args ?? log;
    const taxToken = String(args.taxToken ?? "").toLowerCase();
    if (!taxToken) return;
    const quote = resolveQuoteToken(taxToken, quoteTokens, wrappedNative);
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
  const { portal, fromBlock, wrappedNative } = config;
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [dayFromBlock, dayToBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  const addFee = (token: string, amount: any) => {
    if (token === NATIVE_TOKEN) {
      dailyFees.addGasToken(amount, TREASURY_RECEIVED);
      dailyRevenue.addGasToken(amount, TREASURY_RECEIVED);
      dailyProtocolRevenue.addGasToken(amount, TREASURY_RECEIVED);
    } else {
      dailyFees.add(token, amount, TREASURY_RECEIVED);
      dailyRevenue.add(token, amount, TREASURY_RECEIVED);
      dailyProtocolRevenue.add(token, amount, TREASURY_RECEIVED);
    }
  };

  const quoteLogs = await options.getLogs({
    target: portal,
    eventAbi: eventAbis.tokenQuoteSet,
    fromBlock,
    toBlock: dayToBlock,
    cacheInCloud: true,
  });
  const quoteTokens = quoteLogs.reduce((acc, log) => {
    acc[log.token.toLowerCase()] = log.quoteToken.toLowerCase();
    return acc;
  }, {} as Record<string, string>);

  const configLogs = await options.getLogs({
    target: portal,
    eventAbi: eventAbis.quoteTokenConfigurationSet,
    topics: [QUOTE_CONFIG_TOPIC],
    fromBlock,
    toBlock: dayToBlock,
    cacheInCloud: true,
    entireLog: true,
  });
  const erc20Quotes = uniqueLower([
    ...configLogs.map((log: any) => {
      const decoded = log.quoteToken || log.args?.quoteToken;
      if (decoded) return String(decoded);
      return log.data ? addressFromDataWord(log.data, 0) : "";
    }),
    wrappedNative,
  ]);

  const processTradeLogs = (logs: any[]) => {
    logs.forEach((log) => {
      const quoteToken = quoteTokens[log.token.toLowerCase()];
      if (!quoteToken) return;
      if (quoteToken === NATIVE_TOKEN) {
        dailyVolume.addGasToken(log.eth);
      } else {
        dailyVolume.add(quoteToken, log.eth);
      }
    });
  };

  const volumeLoop = (async () => {
    for (let start = dayFromBlock; start <= dayToBlock; start += BLOCKS_PER_BATCH) {
      const end = Math.min(start + BLOCKS_PER_BATCH - 1, dayToBlock);
      const [buyLogs, sellLogs] = await Promise.all([
        options.getLogs({ target: portal, eventAbi: eventAbis.tokenBought, fromBlock: start, toBlock: end, skipCacheRead: true }),
        options.getLogs({ target: portal, eventAbi: eventAbis.tokenSold, fromBlock: start, toBlock: end, skipCacheRead: true }),
      ]);
      processTradeLogs(buyLogs);
      processTradeLogs(sellLogs);
    }
  })();

  const feePrep = (async () => {
    const safe = config.safe.toLowerCase();

    const nativeLogs = await options.getLogs({
      target: safe,
      eventAbi: eventAbis.safeReceived,
    });
    nativeLogs.forEach((log: any) => addFee(NATIVE_TOKEN, log.value));

    if (erc20Quotes.length) {
      const transferLogs = await options.getLogs({
        targets: erc20Quotes,
        eventAbi: eventAbis.transfer,
        topics: [TRANSFER_TOPIC, null as any, padAddress(safe)],
        flatten: false,
      });
      transferLogs.forEach((tokenLogs: any[], i: number) => {
        const token = erc20Quotes[i];
        (tokenLogs || []).forEach((log: any) => addFee(token, log.value));
      });
    }
  })();

  const supplySidePrep = fetchSupplySide(options, config, {
    erc20Quotes,
    quoteTokens,
    dailyFees,
    dailySupplySideRevenue,
  });

  await Promise.all([volumeLoop, feePrep, supplySidePrep]);

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
