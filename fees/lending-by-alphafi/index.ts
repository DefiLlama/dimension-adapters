import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Returns USD amounts for an arbitrary time range (max 25 hours)
const FEES_API = "https://api-staging.alphafi.xyz/public/metrics/fees";

interface FeesResponse {
  start: number;
  end: number;
  alphalend: {
    fees: number;
    revenue: number;
    supplySideRevenue: number;
  };
}

const LENDING_FEES = 'Lending Fees';
const PROTOCOL_SHARE = 'Protocol Share';
const SUPPLY_SIDE_INTEREST = 'Supply Side Interest';

const fetch = async (options: FetchOptions) => {
  const res: FeesResponse = await fetchURL(`${FEES_API}?start=${options.fromTimestamp}&end=${options.toTimestamp}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(res.alphalend.fees, LENDING_FEES);
  dailyRevenue.addUSDValue(res.alphalend.revenue, PROTOCOL_SHARE);
  dailySupplySideRevenue.addUSDValue(res.alphalend.supplySideRevenue, SUPPLY_SIDE_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest paid by borrowers and liquidation fees collected on AlphaLend markets.",
  Revenue: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  ProtocolRevenue: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  SupplySideRevenue: "Share of borrow interest distributed to lenders.",
};

const breakdownMethodology = {
  Fees: {
    [LENDING_FEES]: "Interest paid by borrowers and liquidation fees collected on AlphaLend markets.",
  },
  Revenue: {
    [PROTOCOL_SHARE]: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  },
  ProtocolRevenue: {
    [PROTOCOL_SHARE]: "Share of borrow interest and liquidation fees kept by the AlphaFi protocol.",
  },
  SupplySideRevenue: {
    [SUPPLY_SIDE_INTEREST]: "Share of borrow interest distributed to lenders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: '2026-03-02',
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
