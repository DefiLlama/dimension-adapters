import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// https://basescan.org/address/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
// https://robinhoodchain.blockscout.com/address/0x5fc5360d0400a0fd4f2af552add042d716f1d168
const ROBINHOOD_USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

const TOKEN_LAUNCH_FEES = "Token Launch Fees";
const SWAP_FEES_TO_CREATORS = "Swap Fees to Creators";
const SWAP_FEES_TO_REFERRERS = "Swap Fees to Referrers";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees to Protocol";
const TOKEN_LAUNCH_FEES_TO_PROTOCOL = "Token Launch Fees to Protocol";
// One normal indexed read followed by at most two direct RPC recovery reads.
const MAX_LOG_FETCH_ATTEMPTS = 3;

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
  legacyFeeCurrency: boolean;
  supportsLaunchFee: boolean;
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
        legacyFeeCurrency: true,
        supportsLaunchFee: false,
      },
      // https://basescan.org/address/0xa52ad458ce0282a971ecc71c051a32f28946bb9f
      {
        id: "base-mainnet-timestamp-v2",
        factory: "0xa52ad458ce0282a971ecc71c051a32f28946bb9f",
        hook: "0x985c14baa2a18316ffda0aefb3a632fadfca2acc",
        feeEscrow: "0xa2cbd9065cec93c443cafb0837a62800ee7c4a84",
        legacyFeeCurrency: false,
        supportsLaunchFee: true,
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
        legacyFeeCurrency: true,
        supportsLaunchFee: false,
      },
      // https://robinhoodchain.blockscout.com/address/0x76f0923ac4df0a079a10f628a7bce6426ccd344a
      {
        id: "robinhood-block-v2",
        factory: "0x76f0923ac4df0a079a10f628a7bce6426ccd344a",
        hook: "0xca4b035a5dbfa2a00fc5dcb08fd1c5a22d0eaa44",
        feeEscrow: "0x00d5701a92794c3744428b62646e7bc4e77a0a9a",
        legacyFeeCurrency: true,
        supportsLaunchFee: false,
      },
      // https://robinhoodchain.blockscout.com/address/0x411f21283d3e492bc395027329e08f9f4f560ba5
      {
        id: "robinhood-timestamp-v3",
        factory: "0x411f21283d3e492bc395027329e08f9f4f560ba5",
        hook: "0x441f773b3bb1ed4c6457d0528624112e43c02acc",
        feeEscrow: "0x32f7a9a05bd62487d085ad494e14ec42543e19d2",
        legacyFeeCurrency: false,
        supportsLaunchFee: true,
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

const splitTransaction = (key: string, unorderedEvents: Array<TradeEvent | CreditEvent>): FeeAllocation[] => {
  const events = [...unorderedEvents].sort((left, right) => left.logIndex - right.logIndex);
  const allocations: FeeAllocation[] = [];
  let pendingCredits: CreditEvent[] = [];

  for (const event of events) {
    if ("amount" in event) {
      pendingCredits.push(event);
      continue;
    }
    if (!pendingCredits.length) throw new Error(`Trade without fee credits in ${key}`);
    if (pendingCredits.some((credit) => credit.currency !== event.currency)) {
      throw new Error(`Trade and credit currencies differ in ${key}`);
    }

    const referrerCredits = pendingCredits.filter(
      (credit) => event.referrer !== ZERO_ADDRESS && credit.recipient === event.referrer,
    );
    const nonReferrerCredits = pendingCredits.filter(
      (credit) => event.referrer === ZERO_ADDRESS || credit.recipient !== event.referrer,
    );
    const creditedTotal = pendingCredits.reduce((sum, credit) => sum + credit.amount, 0n);
    if (
      creditedTotal !== event.totalFee
      || pendingCredits.length > 3
      || referrerCredits.length > 1
      || nonReferrerCredits.length < 1
      || nonReferrerCredits.length > 2
    ) {
      throw new Error(`Invalid fee split in ${key}`);
    }

    allocations.push({
      trade: event,
      creatorFee: nonReferrerCredits.slice(0, -1).reduce((sum, credit) => sum + credit.amount, 0n),
      referrerFee: referrerCredits.reduce((sum, credit) => sum + credit.amount, 0n),
      platformFee: nonReferrerCredits[nonReferrerCredits.length - 1].amount,
    });
    pendingCredits = [];
  }

  if (pendingCredits.length) throw new Error(`Fee credits without a following trade in ${key}`);
  if (!allocations.length) throw new Error(`Transaction has no complete fee allocation in ${key}`);
  return allocations;
};

const mergeLogs = <TArgs>(current: DecodedLog<TArgs>[], incoming: DecodedLog<TArgs>[]) => {
  const logs = new Map<string, DecodedLog<TArgs>>();
  for (const log of current) {
    const position = positionOf(log);
    logs.set(`${normalizeAddress(log.address)}:${position.transactionHash}:${position.blockNumber}:${position.logIndex}`, log);
  }
  for (const log of incoming) {
    const position = positionOf(log);
    logs.set(`${normalizeAddress(log.address)}:${position.transactionHash}:${position.blockNumber}:${position.logIndex}`, log);
  }
  return [...logs.values()];
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
    const key = transactionKey(suite, event.transactionHash);
    const events = eventsByTransaction.get(key);
    if (events) events.push(event);
    else eventsByTransaction.set(key, [event]);
  };
  for (const log of tradeLogs) addEvent(decodeTrade(log));
  for (const log of creditLogs) addEvent(decodeCredit(log));

  const allocations: FeeAllocation[] = [];
  for (const [key, events] of eventsByTransaction) {
    if (suite.legacyFeeCurrency && events.every((event) => !legacyQuotes.has(event.currency))) continue;
    allocations.push(...splitTransaction(key, events));
  }
  return allocations;
};

const fetchSuiteAllocations = async (options: FetchOptions, suite: Suite, legacyQuotes: Set<string>) => {
  let tradeLogs: DecodedLog<TradeArgs>[] = [];
  let creditLogs: DecodedLog<CreditArgs>[] = [];
  let reconciliationError: unknown;

  for (let attempt = 0; attempt < MAX_LOG_FETCH_ATTEMPTS; attempt += 1) {
    const retryDirectly = attempt > 0;
    const incomingTrades = await options.getLogs({
      target: suite.hook,
      eventAbi: TRADE_EVENT,
      entireLog: true,
      parseLog: true,
      skipCacheRead: retryDirectly,
      skipIndexer: retryDirectly,
    }) as DecodedLog<TradeArgs>[];
    const incomingCredits = await options.getLogs({
      target: suite.feeEscrow,
      eventAbi: CREDITED_EVENT,
      entireLog: true,
      parseLog: true,
      skipCacheRead: retryDirectly,
      skipIndexer: retryDirectly,
    }) as DecodedLog<CreditArgs>[];
    tradeLogs = retryDirectly ? mergeLogs(tradeLogs, incomingTrades) : incomingTrades;
    creditLogs = retryDirectly ? mergeLogs(creditLogs, incomingCredits) : incomingCredits;

    try {
      return reconcileSuite(suite, legacyQuotes, tradeLogs, creditLogs);
    } catch (error) {
      reconciliationError = error;
    }
  }

  throw reconciliationError;
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const config = chainConfig[options.chain];
  if (!config) throw new Error(`Unsupported o1 Launchpad chain ${options.chain}`);

  const launchFeeSuites = config.suites.filter((suite) => suite.supportsLaunchFee);
  const launchFeeLogs = launchFeeSuites.length
    ? await options.getLogs({
      targets: launchFeeSuites.map((suite) => suite.factory),
      eventAbi: LAUNCH_FEE_PAID_EVENT,
    }) as LaunchFeeArgs[]
    : [];

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const suite of config.suites) {
    const allocations = await fetchSuiteAllocations(options, suite, config.legacyQuotes);
    for (const { trade, creatorFee, referrerFee, platformFee } of allocations) {
      if (suite.legacyFeeCurrency && !config.legacyQuotes.has(trade.currency)) continue;
      addToken(dailyFees, trade.currency, trade.totalFee, METRIC.SWAP_FEES);
      addToken(dailyUserFees, trade.currency, trade.totalFee, METRIC.SWAP_FEES);
      addToken(dailySupplySideRevenue, trade.currency, creatorFee, SWAP_FEES_TO_CREATORS);
      addToken(dailySupplySideRevenue, trade.currency, referrerFee, SWAP_FEES_TO_REFERRERS);
      addToken(dailyRevenue, trade.currency, platformFee, SWAP_FEES_TO_PROTOCOL);
      addToken(dailyProtocolRevenue, trade.currency, platformFee, SWAP_FEES_TO_PROTOCOL);
    }
  }

  for (const log of launchFeeLogs) {
    const currency = normalizeAddress(log.quote);
    const amount = toBigInt(log.amount);
    addToken(dailyFees, currency, amount, TOKEN_LAUNCH_FEES);
    addToken(dailyUserFees, currency, amount, TOKEN_LAUNCH_FEES);
    addToken(dailyRevenue, currency, amount, TOKEN_LAUNCH_FEES_TO_PROTOCOL);
    addToken(dailyProtocolRevenue, currency, amount, TOKEN_LAUNCH_FEES_TO_PROTOCOL);
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
  isExpensiveAdapter: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
