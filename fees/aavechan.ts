import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

type AaveCollectorStream = {
  streamId: number;
  tokenAddress: string;
  startTime: number;
  stopTime: number;
  canceledAt?: number;
  ratePerSecond: bigint;
}

const STREAMS: AaveCollectorStream[] = [
  {
    streamId: 100034,
    tokenAddress: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
    startTime: 1715437319,
    stopTime: 1746973319,
    ratePerSecond: 31709791983764586n,
  },
  {
    streamId: 100070,
    tokenAddress: "0x18eFE565A5373f430e2F809b97De30335B3ad96A",
    startTime: 1762607375,
    stopTime: 1794143375,
    canceledAt: 1772987771,
    ratePerSecond: 95129375951293759n,
  },
];

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  for (const stream of STREAMS) {
    const endTime = Math.min(stream.stopTime, stream.canceledAt ?? stream.stopTime);
    const activeStart = Math.max(options.startTimestamp, stream.startTime);
    const activeEnd = Math.min(options.endTimestamp, endTime);
    const activeSeconds = activeEnd - activeStart;
    if (activeSeconds <= 0) continue;

    const fees = stream.ratePerSecond * BigInt(activeSeconds);
    dailyFees.add(stream.tokenAddress, fees, METRIC.MANAGEMENT_FEES);
    dailyProtocolRevenue.add(stream.tokenAddress, fees, METRIC.MANAGEMENT_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: 'Fees accrued linearly from Aave Collector streams distributed to Aave-Chan.',
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: 'Fees accrued linearly from Aave Collector streams distributed to Aave-Chan.',
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: 'Fees accrued linearly from Aave Collector streams distributed to Aave-Chan.',
  },
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2024-05-11",
  version: 2,
  methodology: {
    Fees: "Aave Collector stream distributions to Aave-Chan.",
    Revenue: "Aave Collector stream distributions to Aave-Chan.",
    ProtocolRevenue: "Aave Collector stream distributions to Aave-Chan.",
  },
  breakdownMethodology,
}

export default adapter;
