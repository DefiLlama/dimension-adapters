import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const START_TIMESTAMP = 1760400000;

const SHARES = "0x04E5a6f7eE9977D38f57945c31B72178c9Cf1c06";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// First/only FeeHandlerSet event found at block 33316772.
// Keep known historical handlers here so old fee events remain included if
// Shares.getFeeHandler() points to a new handler in the future.
const KNOWN_FEE_HANDLERS = [
  "0xFd1953134930F7550336C6e796Cd05805710518e",
];

const ABI = {
  getFeeHandler: "address:getFeeHandler",
};

const FEE_EVENTS = [
  {
    eventAbi: "event ManagementFeeSettled(address recipient, uint256 value)",
    metric: METRIC.MANAGEMENT_FEES,
    countZeroRecipientAsRevenue: true,
  },
  {
    eventAbi: "event PerformanceFeeSettled(address recipient, uint256 value)",
    metric: METRIC.PERFORMANCE_FEES,
    countZeroRecipientAsRevenue: true,
  },
  {
    eventAbi: "event EntranceFeeSettled(address recipient, uint256 value)",
    metric: METRIC.DEPOSIT_WITHDRAW_FEES,
    countZeroRecipientAsRevenue: false,
  },
  {
    eventAbi: "event ExitFeeSettled(address recipient, uint256 value)",
    metric: METRIC.DEPOSIT_WITHDRAW_FEES,
    countZeroRecipientAsRevenue: false,
  },
];

function usd18ToNumber(value: any): number {
  const v = BigInt(value.toString());

  // FeeHandler settlement values are denominated in the Shares value asset
  // with 18 decimals. Convert safely to a JS number while preserving 6
  // decimals of USD precision.
  return Number(v / 10n ** 12n) / 1e6;
}

async function getFeeHandlers(options: FetchOptions): Promise<string[]> {
  const currentFeeHandler = await options.api.call({
    target: SHARES,
    abi: ABI.getFeeHandler,
  });

  return [
    ...new Set(
      [...KNOWN_FEE_HANDLERS, currentFeeHandler].map((handler) =>
        handler.toLowerCase()
      )
    ),
  ];
}

async function getLogsForFeeHandlers(
  options: FetchOptions,
  feeHandlers: string[],
  eventAbi: string
) {
  return options.getLogs({
    targets: feeHandlers,
    eventAbi,
    onlyArgs: true,
    flatten: true,
    // include pullHourly: true when supported by this getLogs wrapper,
  });
}

function addFeeLogs({
  logs,
  metric,
  balances,
  countZeroRecipientAsRevenue,
}: {
  logs: any[];
  metric: string;
  balances: {
    dailyFees: any;
    dailyUserFees: any;
    dailyRevenue: any;
    dailyProtocolRevenue: any;
  };
  countZeroRecipientAsRevenue: boolean;
}) {
  for (const log of logs) {
    const valueUsd = usd18ToNumber(log.value);

    if (
      !countZeroRecipientAsRevenue &&
      log.recipient.toLowerCase() === ZERO_ADDRESS
    ) {
      continue;
    }
    balances.dailyFees.addUSDValue(valueUsd, metric);
    balances.dailyUserFees.addUSDValue(valueUsd, metric);

    balances.dailyRevenue.addUSDValue(valueUsd, metric);
    balances.dailyProtocolRevenue.addUSDValue(valueUsd, metric);
  }
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

    try {
    const feeHandlers = await getFeeHandlers(options);

    const balances = {
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue,
    };

    const logsByEvent = await Promise.all(
      FEE_EVENTS.map(async (feeEvent) => {
        const logs = await getLogsForFeeHandlers(
          options,
          feeHandlers,
          feeEvent.eventAbi
        );

        return {
          ...feeEvent,
          logs,
        };
      })
    );

    for (const feeEvent of logsByEvent) {
      addFeeLogs({
        logs: feeEvent.logs,
        metric: feeEvent.metric,
        balances,
        countZeroRecipientAsRevenue: feeEvent.countZeroRecipientAsRevenue,
      });
    }
  } catch (e) {
    console.error("blackopal fees fetch failed", e);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.PLUME]: {
      fetch,
      start: START_TIMESTAMP,
    },
  },
  methodology: {
    Fees:
      "Fees are tracked from BlackOpal FeeHandler settlement events: ManagementFeeSettled, PerformanceFeeSettled, EntranceFeeSettled, and ExitFeeSettled. FeeHandler addresses include the known historical FeeHandler and the current Shares getFeeHandler value. Event values are denominated in the Shares value asset with 18 decimals.",
    UserFees:
      "Same as Fees; these are fees charged through the Shares/FeeHandler system.",
    Revenue:
      "Revenue is the portion of settled fees accrued to fee recipients. Management and performance fees are counted as revenue. Entrance and exit fees are counted as revenue only when the recipient is non-zero.",
    ProtocolRevenue:
      "Same as Revenue; settled fee amounts accrued to FeeHandler recipients.",
    SupplySideRevenue:
      "No supply-side revenue is currently tracked for this adapter.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MANAGEMENT_FEES]:
        "ManagementFeeSettled values emitted by FeeHandler contracts.",
      [METRIC.PERFORMANCE_FEES]:
        "PerformanceFeeSettled values emitted by FeeHandler contracts.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]:
        "EntranceFeeSettled and ExitFeeSettled values emitted by FeeHandler contracts.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]:
        "Management fees accrued to the configured fee recipient.",
      [METRIC.PERFORMANCE_FEES]:
        "Performance fees accrued to the configured fee recipient.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]:
        "Entrance and exit fees accrued to a non-zero fee recipient.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]:
        "Management fees accrued to the configured fee recipient.",
      [METRIC.PERFORMANCE_FEES]:
        "Performance fees accrued to the configured fee recipient.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]:
        "Entrance and exit fees accrued to a non-zero fee recipient.",
    },
  },
};

export default adapter;