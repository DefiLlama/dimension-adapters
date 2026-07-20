import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

const NETWORK_FEES_URL =
  "https://api.eclipsescan.xyz/v1/analytics/network?range=all&filter=network_fees";

interface DayFees {
  d_key: number;
  day_unix: number;
  total_fee: number;
  base_fee: number;
  priority_fee: number;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const res = await fetchURL(NETWORK_FEES_URL);

  const days: Record<string, DayFees> = res?.data?.data;
  if (!res?.success || !days) throw new Error(`Eclipse: unexpected response from EclipseScan network fees API for ${options.dateString}`);

  const dayKey = options.dateString.replace(/-/g, "");
  const day = days[dayKey];

  if(!day) {
    throw new Error(`Eclipse: no data found for date ${options.dateString}`);
  }

  dailyFees.addCGToken("ethereum", day.base_fee, METRIC.TRANSACTION_BASE_FEES);
  dailyFees.addCGToken("ethereum", day.priority_fee, METRIC.TRANSACTION_PRIORITY_FEES);

  return { dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ECLIPSE],
  start: "2024-07-29",
  protocolType: ProtocolType.CHAIN,
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Transaction fees (base + priority) paid by users on the Eclipse network.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: "Transaction base fees paid by users.",
      [METRIC.TRANSACTION_PRIORITY_FEES]: "Transaction priority fees paid by users.",
    },
  },
};

export default adapter;
