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
  // CreateStream: block 19847355, 2024-05-11T14:21:59Z, tx 0x555405ac26f71bf76ce2ae4550523e94b5f7a2ca1179b40c21eedf6d1628fd6e.
  {
    streamId: 100034,
    tokenAddress: "0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f",
    startTime: 1715437319,
    stopTime: 1746973319,
    ratePerSecond: 31709791983764586n,
  },
  // CreateStream: block 23754744, 2025-11-08T13:09:35Z, tx 0x138d1ee42253e852aebfe53644db4c05bf85853373a698b85a5e8297fc21959d.
  // CancelStream: block 24613978, 2026-03-08T16:36:11Z, tx 0xbe58a065c938fa64e141a3303be9bfc042de319431a62abd43f40b787f9f3b45.
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
  deadFrom: "2026-03-08",
  version: 2,
  methodology: {
    Fees: "Aave Collector stream distributions to Aave-Chan.",
    Revenue: "Aave Collector stream distributions to Aave-Chan.",
    ProtocolRevenue: "Aave Collector stream distributions to Aave-Chan.",
  },
  breakdownMethodology,
}

export default adapter;
