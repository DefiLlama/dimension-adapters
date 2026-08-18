import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";

const NATIVE_TOKEN = ADDRESSES.null;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const QUOTE_CONFIG_TOPIC = "0x9a1f38e55c729ebf0c45d240a00b09f0a79a715df7cfd6e8942bd3f8da839199";
const TREASURY_RECEIVED = "Treasury Received";

// Source: https://docs.flap.sh/flap/developers/deployed-contract-addresses
const chainConfig: Record<string, {
  start: string;
  portal: string;
  fromBlock: number;
  safe?: string;
}> = {
  [CHAIN.BSC]: {
    start: "2024-06-27",
    portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
    fromBlock: 39980228,
    // FEE_RECEIVER fallback  (BSC treasury Safe)
    safe: "0x8a08d98cbb218fceb318ecf3abc1ba43d8a7ab0e",
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
  },
  [CHAIN.MONAD]: {
    start: "2025-10-30",
    portal: "0x30e8ee7b5881bf2E158A0514f2150aabe2c68b23",
    fromBlock: 32284042,
  },
};

const eventAbis = {
  tokenBought: "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenSold: "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  tokenQuoteSet: "event TokenQuoteSet(address token, address quoteToken)",
  quoteTokenConfigurationSet: "event QuoteTokenConfigurationSet(address quoteToken, tuple(uint8 enabled, uint8 defaultCurve, uint8 alternativeCurve, uint8 nativeToQuoteSwapType, uint8 dexId) config)",
  transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  safeReceived: "event SafeReceived(address indexed sender, uint256 value)",
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

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const config = chainConfig[options.chain];
  const { portal, fromBlock } = config;
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

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

  // Map every token to its quote token once. TokenQuoteSet fires once per token
  // at creation, so this is fetched over the full history and cached in cloud.
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
  })();

  // Fees match : every quote-token inflow to the fee Safe, any sender.
  const feePrep = (async () => {
    let safe: string | undefined = config.safe;
    try {
      safe = await options.api.call({ target: portal, abi: "address:FEE_RECEIVER" });
    } catch (e) {
      const msg = String((e as any)?.message ?? e);
      const missingGetter = /execution reverted|returned no data|FUNCTION_SELECTOR_NOT_RECOGNIZED/i.test(msg);
      if (!missingGetter) throw e;
      if (!config.safe) {
        console.log(`flap: FEE_RECEIVER missing on ${options.chain}, skipping treasury fees`);
        return;
      }
      console.log(`flap: FEE_RECEIVER() unsupported on ${options.chain}, using fallback ${config.safe}`);
      safe = config.safe;
    }
    if (!safe) {
      console.log(`flap: FEE_RECEIVER missing on ${options.chain}, skipping treasury fees`);
      return;
    }
    safe = safe.toLowerCase();

    const configLogs = await options.getLogs({
      target: portal,
      eventAbi: eventAbis.quoteTokenConfigurationSet,
      topics: [QUOTE_CONFIG_TOPIC],
      fromBlock,
      toBlock: dayToBlock,
      cacheInCloud: true,
      entireLog: true,
    });
    const erc20Quotes = uniqueLower(configLogs.map((log: any) => {
      const decoded = log.quoteToken || log.args?.quoteToken;
      if (decoded) return String(decoded);
      return log.data ? addressFromDataWord(log.data, 0) : "";
    }));

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

  await Promise.all([volumeLoop, feePrep]);

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue };
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
