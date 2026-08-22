import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

const PLS_BURNED_URL = "https://www.pulsechainstats.com/api/gas-stats/pls-burned";

type BurnDay = {
  date: string;
  estimatedDayBurn: number;
};

let cachedBurnDays: BurnDay[] | undefined;

async function getBurnDays(): Promise<BurnDay[]> {
  if (cachedBurnDays) return cachedBurnDays;

  const res = await fetchURL(PLS_BURNED_URL);
  const days = res?.data?.burn?.data;
  if (!res?.success || !Array.isArray(days)) {
    throw new Error("PulseChain: unexpected response from pulsechainstats PLS burned API");
  }

  cachedBurnDays = days;
  return days;
}

const fetch = async (options: FetchOptions) => {
  const days = await getBurnDays();
  const day = days.find((item) => item.date === options.dateString);
  if (!day) throw new Error(`PulseChain: no PLS burn data for ${options.dateString}`);

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(day.estimatedDayBurn * 1e18, METRIC.TRANSACTION_BASE_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.PULSECHAIN],
  start: '2023-05-13',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Estimated PLS burned from EIP-1559 base fees.',
    Revenue: 'PLS burned via EIP-1559 base fee.',
    HoldersRevenue: 'PLS burned via EIP-1559 base fee.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Estimated PLS base fees burned (pulsechainstats sampled daily burn).',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Estimated PLS base fees burned.',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Estimated PLS base fees burned.',
    },
  },
}

export default adapter;
