import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// ABI for YieldSharing contract
const YIELD_SHARING_ABI = {
  performanceFee: "uint256:performanceFee",
  safetyBufferSize: "uint256:safetyBufferSize",
  receiptToken: "address:receiptToken",
  YieldAccrued: "event YieldAccrued(uint256 indexed timestamp, int256 yield)",
};

// YieldSharing contract addresses
const YIELD_SHARING_CONTRACT = '0x1cb9ed33924741f500e739e38c3215a76cd1f579'

// Custom metrics for fee breakdown
const SAFETY_BUFFER_METRIC = 'Safety Buffer'; // iUSD set aside to absorb minor yield losses

async function trackYieldAccruedEvents(
  options: FetchOptions,
  yieldSharingAddress: string
): Promise<{
  totalYield: bigint;
  performanceFees: bigint;
  safetyBufferAmount: bigint;
  supplySideRevenue: bigint;
}> {
  const performanceFeeRaw = await options.api.call({
    target: yieldSharingAddress,
    abi: YIELD_SHARING_ABI.performanceFee,
  });

  const safetyBuffer = await options.api.call({
    target: yieldSharingAddress,
    abi: YIELD_SHARING_ABI.safetyBufferSize,
  });

  const logs = await options.getLogs({
    target: yieldSharingAddress,
    eventAbi: YIELD_SHARING_ABI.YieldAccrued,
    onlyArgs: true,
  });

  const performanceFee = BigInt(performanceFeeRaw);
  const FEE_BASE = 10n ** 18n;

  let totalPositiveYield = 0n;
  let totalPerformanceFees = 0n;

  for (const log of logs) {
    const yieldAmount = BigInt(
      Array.isArray(log) ? log[1] ?? 0 : log.yield ?? 0
    );

    if (yieldAmount > 0n) {
      totalPositiveYield += yieldAmount;

      const fee = (yieldAmount * performanceFee) / FEE_BASE;
      totalPerformanceFees += fee;
    }
  }

  // Safety buffer increase is protocol-owned revenue
  const safetyBufferAmount = BigInt(safetyBuffer);
  const protocolRevenue = totalPerformanceFees + safetyBufferAmount;

  const supplySideRevenue = totalPositiveYield > protocolRevenue
  ? totalPositiveYield - protocolRevenue
  : 0n;

  return {
    totalYield: totalPositiveYield,
    performanceFees: totalPerformanceFees,
    safetyBufferAmount,
    supplySideRevenue,
  };
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const {performanceFees, safetyBufferAmount, supplySideRevenue } =
    await trackYieldAccruedEvents(options, YIELD_SHARING_CONTRACT);

  const receiptToken = await options.api.call({
    target: YIELD_SHARING_CONTRACT,
    abi: YIELD_SHARING_ABI.receiptToken,
  });

  dailyFees.add(receiptToken, supplySideRevenue, METRIC.STAKING_REWARDS);
  dailyFees.add(receiptToken, performanceFees, METRIC.PERFORMANCE_FEES);
  dailyFees.add(receiptToken, safetyBufferAmount, SAFETY_BUFFER_METRIC);
  dailyRevenue.add(receiptToken, performanceFees, METRIC.PERFORMANCE_FEES);
  dailySupplySideRevenue.add(receiptToken, supplySideRevenue, METRIC.STAKING_REWARDS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "All fees charged by InfiniFi, including performance fees on YieldAccrued events. Performance fees are calculated using the on-chain performanceFee parameter and sent to the performanceFeeRecipient.",

  Revenue:
    "Protocol revenue consists of performance fees collected by the protocol and sent to the performanceFeeRecipient address.",

  ProtocolRevenue:
    "Same as Revenue. Performance fees collected by the protocol and sent to the performanceFeeRecipient address.",

  SupplySideRevenue:
    "Net yield distributed to users after protocol-owned value is deducted. Includes yield distributed to siUSD holders (liquid) and iUSD lockers (illiquid)",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Net yield distributed to users after protocol-owned value is deducted. Includes yield distributed to siUSD holders (staking/liquid) and iUSD lockers (locking/illiquid).",
    [METRIC.PERFORMANCE_FEES]: "Performance fees charged by InfiniFi on generated yield. Calculated as a percentage of positive YieldAccrued events using the on-chain performanceFee parameter (max 20%).",
    [SAFETY_BUFFER_METRIC]: "iUSD set aside to absorb minor yield losses. This is a protocol-owned reserve fund retained to absorb minor losses.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol and sent to the performanceFeeRecipient address.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol and sent to the performanceFeeRecipient address.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "Yield distributed to siUSD holders (staking/liquid) and iUSD lockers (locking/illiquid).",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-06-07",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
