import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from '../../helpers/coreAssets.json'

const ZERO_ADDRESS = ADDRESSES.null;
const BASE_USDC = ADDRESSES.base.USDC;
const ROBINHOOD_USDG = ADDRESSES.robinhood.USDG;

const TOKEN_LAUNCH_FEES = "Token Launch Fees";
const SWAP_FEES_TO_CREATORS = "Swap Fees to Creators";
const SWAP_FEES_TO_REFERRERS = "Swap Fees to Referrers";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees to Protocol";
const TOKEN_LAUNCH_FEES_TO_PROTOCOL = "Token Launch Fees to Protocol";

const TRADE_EVENT =
  "event Trade(bytes32 indexed id, address indexed executor, address indexed referrer, address feeCurrency, uint256 totalFee, bytes32 comment)";
const CREDITED_EVENT =
  "event Credited(address indexed recipient, address indexed currency, uint256 amount)";
const LAUNCH_FEE_PAID_EVENT =
  "event LaunchFeePaid(address indexed payer, address indexed quote, address indexed treasury, uint256 amount)";

type NumericValue = bigint | number | string;

interface Suite {
  id: string;
  factory: string;
  hook: string;
  feeEscrow: string;
  firstBlock: number;
  legacyFeeCurrency: boolean;
  launchFeeCurrency: "none" | "quote" | "native";
}

interface ChainConfig {
  start: string;
  suites: Suite[];
  legacyQuotes: Set<string>;
}

interface DecodedLog<TArgs> {
  address: string;
  transactionHash: string;
  blockNumber: number;
  logIndex?: number;
  index?: number;
  args: TArgs;
}

interface TradeArgs {
  referrer: string;
  feeCurrency: string;
  totalFee: NumericValue;
}

interface CreditArgs {
  recipient: string;
  currency: string;
  amount: NumericValue;
}

interface LaunchFeeArgs {
  quote: string;
  amount: NumericValue;
}

interface PositionedEvent {
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
}

interface TradeEvent extends PositionedEvent {
  referrer: string;
  currency: string;
  totalFee: bigint;
}

interface CreditEvent extends PositionedEvent {
  recipient: string;
  currency: string;
  amount: bigint;
}

interface FeeAllocation {
  trade: TradeEvent;
  creatorFee: bigint;
  referrerFee: bigint;
  platformFee: bigint;
}

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    start: "2026-07-01",
    suites: [
      // https://basescan.org/address/0xe3ab924c72463c1ac8d1d8352ee640b89eb1ea64
      {
        id: "base-mainnet-block-v1",
        factory: "0xe3ab924c72463c1ac8d1d8352ee640b89eb1ea64",
        hook: "0xa068cf4c52abdd3479145c4b3cbd8e3d71542a44",
        feeEscrow: "0xabe87e4af23dafad0a170aa900d574c03d904597",
        // First suite block: https://basescan.org/block/48364845
        firstBlock: 48_364_845,
        legacyFeeCurrency: true,
        launchFeeCurrency: "none",
      },
      // https://basescan.org/address/0xa52ad458ce0282a971ecc71c051a32f28946bb9f
      {
        id: "base-mainnet-timestamp-v2",
        factory: "0xa52ad458ce0282a971ecc71c051a32f28946bb9f",
        hook: "0x985c14baa2a18316ffda0aefb3a632fadfca2acc",
        feeEscrow: "0xa2cbd9065cec93c443cafb0837a62800ee7c4a84",
        // First suite block: https://basescan.org/block/48451098
        firstBlock: 48_451_098,
        legacyFeeCurrency: false,
        launchFeeCurrency: "quote",
      },
      // https://basescan.org/address/0x1de58a6769526a03a504d9d59b8757cd8097dc57
      {
        id: "base-mainnet-rwa-timestamp-v3",
        factory: "0x1de58a6769526a03a504d9d59b8757cd8097dc57",
        hook: "0xbca7774615c74b7991a111f1c7b2d0efea61aacc",
        feeEscrow: "0xcf9ed8f4145eac9059bcd83227eeb8591fac0a9a",
        // First suite block: https://basescan.org/block/49121014
        firstBlock: 49_121_014,
        legacyFeeCurrency: false,
        launchFeeCurrency: "native",
      },
      // https://basescan.org/address/0xff70918ef17a2d74d683a8297813b177bafad1f4
      {
        id: "base-mainnet-rwa-timestamp-v4",
        factory: "0xff70918ef17a2d74d683a8297813b177bafad1f4",
        hook: "0x3b2b979df21036cee51b8debb13100e2cb8deacc",
        feeEscrow: "0x1d8c991a9019df7d72adcd8dea6f12d600c9d02f",
        // First suite block: https://basescan.org/block/50137081
        firstBlock: 50_137_081,
        legacyFeeCurrency: false,
        launchFeeCurrency: "native",
      },
    ],
    legacyQuotes: new Set([ZERO_ADDRESS, BASE_USDC]),
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-01",
    suites: [
      // https://robinhoodchain.blockscout.com/address/0x8b40fc20c405d47d725c9723d056a1c6f62bbccf
      {
        id: "robinhood-block-v1",
        factory: "0x8b40fc20c405d47d725c9723d056a1c6f62bbccf",
        hook: "0xe960e6c80c74cfdf03c91e7af4e1f5f53f096a44",
        feeEscrow: "0xf5681c4c0dc0c2e32c9d127b3cc0fc992b584553",
        // First suite block: https://robinhoodchain.blockscout.com/block/2131131
        firstBlock: 2_131_131,
        legacyFeeCurrency: true,
        launchFeeCurrency: "none",
      },
      // https://robinhoodchain.blockscout.com/address/0x76f0923ac4df0a079a10f628a7bce6426ccd344a
      {
        id: "robinhood-block-v2",
        factory: "0x76f0923ac4df0a079a10f628a7bce6426ccd344a",
        hook: "0xca4b035a5dbfa2a00fc5dcb08fd1c5a22d0eaa44",
        feeEscrow: "0x00d5701a92794c3744428b62646e7bc4e77a0a9a",
        // First suite block: https://robinhoodchain.blockscout.com/block/4415287
        firstBlock: 4_415_287,
        legacyFeeCurrency: true,
        launchFeeCurrency: "none",
      },
      // https://robinhoodchain.blockscout.com/address/0x411f21283d3e492bc395027329e08f9f4f560ba5
      {
        id: "robinhood-timestamp-v3",
        factory: "0x411f21283d3e492bc395027329e08f9f4f560ba5",
        hook: "0x441f773b3bb1ed4c6457d0528624112e43c02acc",
        feeEscrow: "0x32f7a9a05bd62487d085ad494e14ec42543e19d2",
        // First suite block: https://robinhoodchain.blockscout.com/block/6131279
        firstBlock: 6_131_279,
        legacyFeeCurrency: false,
        launchFeeCurrency: "quote",
      },
      // https://robinhoodchain.blockscout.com/address/0xe64ac4113848bbc1a6dde1a6d1da96720a36f297
      {
        id: "robinhood-rwa-timestamp-v4",
        factory: "0xe64ac4113848bbc1a6dde1a6d1da96720a36f297",
        hook: "0x778b0c4eea7d35d66513b587ba87fc9084b0eacc",
        feeEscrow: "0x4f2b1cda8748cd64c56039bf5e2e54bc13d4a3d7",
        // First suite block: https://robinhoodchain.blockscout.com/block/18487505
        firstBlock: 18_487_505,
        legacyFeeCurrency: false,
        launchFeeCurrency: "native",
      },
    ],
    legacyQuotes: new Set([ZERO_ADDRESS, ROBINHOOD_USDG]),
  },
};

const normalizeAddress = (address: string) => address.toLowerCase();
const toBigInt = (value: NumericValue) => BigInt(value.toString());
const transactionKey = (suite: Suite, hash: string) => `${suite.id}:${hash}`;

const positionOf = <TArgs>(log: DecodedLog<TArgs>): PositionedEvent => {
  const logIndex = log.logIndex ?? log.index;
  if (logIndex === undefined) throw new Error("o1 Launchpad event is missing its log index");
  return {
    transactionHash: normalizeAddress(log.transactionHash),
    blockNumber: Number(log.blockNumber),
    logIndex: Number(logIndex),
  };
};

const addToken = (
  balances: ReturnType<FetchOptions["createBalances"]>,
  currency: string,
  amount: bigint,
  label: string,
) => {
  if (amount === 0n) return;
  if (currency === ZERO_ADDRESS) balances.addGasToken(amount, label);
  else balances.add(currency, amount, label);
};

const dedupeLogs = <TArgs>(logs: DecodedLog<TArgs>[]) => {
  const unique = new Map<string, DecodedLog<TArgs>>();
  for (const log of logs) {
    const position = positionOf(log);
    unique.set(
      `${normalizeAddress(log.address)}:${position.transactionHash}:${position.blockNumber}:${position.logIndex}`,
      log,
    );
  }
  return [...unique.values()];
};

const splitTransaction = (unorderedEvents: Array<TradeEvent | CreditEvent>): FeeAllocation[] => {
  const events = [...unorderedEvents].sort((left, right) => left.logIndex - right.logIndex);
  const allocations: FeeAllocation[] = [];
  let pendingCredits: CreditEvent[] = [];

  for (const event of events) {
    if ("amount" in event) {
      pendingCredits.push(event);
      continue;
    }
    if (!pendingCredits.length) return [];
    if (pendingCredits.some((credit) => credit.currency !== event.currency)) return [];

    const referrerCredits = pendingCredits.filter(
      (credit) => event.referrer !== ZERO_ADDRESS && credit.recipient === event.referrer,
    );
    const nonReferrerCredits = pendingCredits.filter(
      (credit) => event.referrer === ZERO_ADDRESS || credit.recipient !== event.referrer,
    );
    const creditedTotal = pendingCredits.reduce((sum, credit) => sum + credit.amount, 0n);
    if (creditedTotal !== event.totalFee || !nonReferrerCredits.length) return [];

    allocations.push({
      trade: event,
      creatorFee: nonReferrerCredits.slice(0, -1).reduce((sum, credit) => sum + credit.amount, 0n),
      referrerFee: referrerCredits.reduce((sum, credit) => sum + credit.amount, 0n),
      platformFee: nonReferrerCredits[nonReferrerCredits.length - 1].amount,
    });
    pendingCredits = [];
  }

  return pendingCredits.length ? [] : allocations;
};

const decodeTrade = (log: DecodedLog<TradeArgs>): TradeEvent => ({
  ...positionOf(log),
  referrer: normalizeAddress(log.args.referrer),
  currency: normalizeAddress(log.args.feeCurrency),
  totalFee: toBigInt(log.args.totalFee),
});

const decodeCredit = (log: DecodedLog<CreditArgs>): CreditEvent => ({
  ...positionOf(log),
  recipient: normalizeAddress(log.args.recipient),
  currency: normalizeAddress(log.args.currency),
  amount: toBigInt(log.args.amount),
});

const reconcileSuite = (
  suite: Suite,
  legacyQuotes: Set<string>,
  tradeLogs: DecodedLog<TradeArgs>[],
  creditLogs: DecodedLog<CreditArgs>[],
) => {
  const eventsByTransaction = new Map<string, Array<TradeEvent | CreditEvent>>();
  const addEvent = (event: TradeEvent | CreditEvent) => {
    if (event.blockNumber < suite.firstBlock) return;
    const key = transactionKey(suite, event.transactionHash);
    const events = eventsByTransaction.get(key);
    if (events) events.push(event);
    else eventsByTransaction.set(key, [event]);
  };
  for (const log of tradeLogs) addEvent(decodeTrade(log));
  for (const log of creditLogs) addEvent(decodeCredit(log));

  const allocations: FeeAllocation[] = [];
  for (const events of eventsByTransaction.values()) {
    if (suite.legacyFeeCurrency && events.every((event) => !legacyQuotes.has(event.currency))) continue;
    allocations.push(...splitTransaction(events));
  }
  return allocations;
};

const PARSED_LOG_FETCH_OPTIONS = {
  entireLog: true,
  parseLog: true,
} as const;


const fetchAllocations = async (options: FetchOptions, config: ChainConfig) => {
  const { suites, legacyQuotes } = config;
  const [tradeLogsPerHook, creditLogsPerEscrow] = await Promise.all([
    options.getLogs({
      targets: suites.map((suite) => suite.hook),
      eventAbi: TRADE_EVENT,
      flatten: false,
      ...PARSED_LOG_FETCH_OPTIONS,
    }),
      options.getLogs({
      targets: suites.map((suite) => suite.feeEscrow),
      eventAbi: CREDITED_EVENT,
      flatten: false,
      ...PARSED_LOG_FETCH_OPTIONS,
    }),
  ]);

  return suites.map((suite, index) => reconcileSuite(
    suite,
    legacyQuotes,
    dedupeLogs(tradeLogsPerHook[index] ?? []),
    dedupeLogs(creditLogsPerEscrow[index] ?? []),
  ));
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const config = chainConfig[options.chain];
  if (!config) throw new Error(`Unsupported o1 Launchpad chain ${options.chain}`);

  const launchFeeSuites = config.suites.filter((suite) => suite.launchFeeCurrency !== "none");
  const launchFeeLogsPerFactory = launchFeeSuites.length
    ? await options.getLogs({
      targets: launchFeeSuites.map((suite) => suite.factory),
      eventAbi: LAUNCH_FEE_PAID_EVENT,
      flatten: false,
    }) as LaunchFeeArgs[][]
    : [];

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const allocationsBySuite = await fetchAllocations(options, config);
  for (const [suiteIndex, suite] of config.suites.entries()) {
    for (const { trade, creatorFee, referrerFee, platformFee } of allocationsBySuite[suiteIndex]) {
      if (suite.legacyFeeCurrency && !config.legacyQuotes.has(trade.currency)) continue;
      addToken(dailyFees, trade.currency, trade.totalFee, METRIC.SWAP_FEES);
      addToken(dailyUserFees, trade.currency, trade.totalFee, METRIC.SWAP_FEES);
      addToken(dailySupplySideRevenue, trade.currency, creatorFee, SWAP_FEES_TO_CREATORS);
      addToken(dailySupplySideRevenue, trade.currency, referrerFee, SWAP_FEES_TO_REFERRERS);
      addToken(dailyRevenue, trade.currency, platformFee, SWAP_FEES_TO_PROTOCOL);
      addToken(dailyProtocolRevenue, trade.currency, platformFee, SWAP_FEES_TO_PROTOCOL);
    }
  }

  for (const [suiteIndex, suite] of launchFeeSuites.entries()) {
    for (const log of launchFeeLogsPerFactory[suiteIndex] ?? []) {
      const currency = suite.launchFeeCurrency === "native"
        ? ZERO_ADDRESS
        : normalizeAddress(log.quote);
      const amount = toBigInt(log.amount);
      addToken(dailyFees, currency, amount, TOKEN_LAUNCH_FEES);
      addToken(dailyUserFees, currency, amount, TOKEN_LAUNCH_FEES);
      addToken(dailyRevenue, currency, amount, TOKEN_LAUNCH_FEES_TO_PROTOCOL);
      addToken(dailyProtocolRevenue, currency, amount, TOKEN_LAUNCH_FEES_TO_PROTOCOL);
    }
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Quote-denominated swap fees plus token-launch fees paid through o1 Launchpad. Legacy swap fees paid in launched tokens are excluded because they cannot be priced consistently.",
  UserFees: "Swap fees paid by traders plus token-launch fees paid by creators.",
  Revenue: "The platform share of swap fees plus token-launch fees received by the protocol.",
  ProtocolRevenue: "The platform share of swap fees plus token-launch fees received by the protocol.",
  SupplySideRevenue: "Swap fees allocated to token creators and referrers.",
  HoldersRevenue: "No fees are distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Quote-denominated fees charged when launch tokens are traded.",
    [TOKEN_LAUNCH_FEES]: "Fees charged when a token is launched through a current production factory.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Quote-denominated fees paid by traders.",
    [TOKEN_LAUNCH_FEES]: "Fees paid by creators when launching a token.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Swap fees allocated to the platform treasury.",
    [TOKEN_LAUNCH_FEES_TO_PROTOCOL]: "Token-launch fees received by the platform treasury.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Swap fees allocated to the platform treasury.",
    [TOKEN_LAUNCH_FEES_TO_PROTOCOL]: "Token-launch fees received by the platform treasury.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_CREATORS]: "Swap fees allocated to token creators.",
    [SWAP_FEES_TO_REFERRERS]: "Swap fees allocated to valid referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
