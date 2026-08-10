import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface IRow {
  DAY: string;
  NETWORK_FEE: number;
}

const fetch = async ({ dateString, createBalances }: FetchOptions) => {
  // THORChain's native L1 transaction fee (NativeTransactionFee, 0.02 RUNE/tx) in USD; it accrues to the Reserve.
  // Source: raynalytics income statement (NETWORK_FEE), the only field that is the native chain fee rather than
  // the outbound/swap mechanics. Days with no row = no native txs (e.g. network halt) -> 0.
  const rows: IRow[] = await httpGet("https://raynalytics.net/api/income-expenses");
  const dayData = rows.find((r) => r.DAY.slice(0, 10) === dateString);

  const dailyFees = createBalances();
  dailyFees.addUSDValue(dayData?.NETWORK_FEE ?? 0, "Network Fees");

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "THORChain's native L1 transaction fee (the NativeTransactionFee constant, 0.02 RUNE per native transaction), charged on native THORChain txs.",
  Revenue: "The native transaction fee accrues entirely to the THORChain Reserve, so revenue equals fees.",
  ProtocolRevenue: "The native transaction fee accrues entirely to the THORChain Reserve.",
};

const breakdownMethodology = {
  Fees: { "Network Fees": "Native L1 transaction fee (0.02 RUNE/tx) paid on native THORChain transactions." },
  Revenue: { "Network Fees": "Native transaction fee retained by the THORChain Reserve." },
  ProtocolRevenue: { "Network Fees": "Native transaction fee retained by the THORChain Reserve." },
};

const adapter: Adapter = {
  version: 1,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.THORCHAIN],
  start: "2021-04-11",
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
