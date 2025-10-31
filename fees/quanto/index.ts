import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FEES_API = "https://api.quanto.trade/v2/accvalue/public/corporate/earn/fee-burned";
const QTO_ADDRESS = "quantoL84tL1HvygKcz3TJtWRU6dFPW8imMzCa4qxGW";

interface FeeRecord {
  recordDate: string;
  fee: string;
}

interface FeeResponse {
  success: boolean;
  data: FeeRecord[];
}

const fetch = async (timestamp: number, _chain: any, options: FetchOptions) => {
  const res: FeeResponse = await fetchURL(FEES_API);

  const requestedDate = new Date(timestamp * 1000).toISOString().split("T")[0];
  const previousDate = new Date((timestamp - 86400) * 1000).toISOString().split("T")[0];

  const requestedRecord = res.data.find(r => r.recordDate === requestedDate);
  const previousRecord = res.data.find(r => r.recordDate === previousDate);

  let dailyFeesBurned = 0;

  if (requestedRecord && previousRecord) {
    dailyFeesBurned = parseFloat(requestedRecord.fee) - parseFloat(previousRecord.fee);
  } else {
    throw new Error(`No data found for the requested date: ${requestedDate}`);
  }

  const dailyFees = options.createBalances()
  dailyFees.add(QTO_ADDRESS, Number((dailyFeesBurned * 1e6) / 0.7));

  return {
    dailyFees,
    dailyRevenue: "0",
    dailyHoldersRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "trading fees paid by users",
  Revenue: "70% of fees are burned and 30% is distributed to token holders.",
  HoldersRevenue: "70% of fees are burned and 30% of trading fees distributed to QTO stakers.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-07-09",
  methodology,
};

export default adapter;
