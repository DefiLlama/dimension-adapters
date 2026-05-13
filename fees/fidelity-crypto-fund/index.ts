import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const ROBINHOOD_API_URL = "https://bonfire.robinhood.com/instruments";
// https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=FSOL.
// https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=FBTC
// https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=FETH
// https://www.fidelity.com/etfs/crypto-funds
const MANAGEMENT_FEE = 0.0025;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

const funds = [
  {
    symbol: "FBTC",
    id: "efe26023-af80-41de-b83c-6ce41b5ecf65",
    feeStart: 1722470400,
  },
  {
    symbol: "FETH",
    id: "06374427-17f3-46fa-8b63-b2f0b60f62d8",
    feeStart: 1735689600,
  },
  {
    symbol: "FSOL",
    id: "d6d17376-e25b-4331-911d-3f93bd765311",
    feeStart: 1779148800,
  },
];

type Fund = typeof funds[number];

async function getFundFees({ id, activeDuration }: Fund & { activeDuration: number }) {
  const response = await httpGet(`${ROBINHOOD_API_URL}/${id}/etp-details`);
  const expenseRatio = response.gross_expense_ratio === undefined || response.gross_expense_ratio === null
    ? MANAGEMENT_FEE
    : Number(response.gross_expense_ratio) / 100;
  return Number(response.aum) * expenseRatio * activeDuration / ONE_YEAR_IN_SECONDS;
}

async function fetch(_timestamp: number, _chainBlocks: any, options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const activeFunds = funds
    .map((fund) => ({
      ...fund,
      activeDuration: Math.max(options.toTimestamp - Math.max(options.fromTimestamp, fund.feeStart), 0),
    }))
    .filter((fund) => fund.activeDuration);


  for (const fund of activeFunds) {
    
    const fees = await getFundFees(fund)
    dailyFees.addUSDValue(fees, METRIC.MANAGEMENT_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Fees: "Management fees charged by Fidelity's spot crypto exchange-traded products.",
  Revenue: "All management fees are retained by Fidelity.",
  ProtocolRevenue: "All management fees are retained by Fidelity.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MANAGEMENT_FEES]: "Annual management fees on AUM after each fund's waiver period, using Robinhood ETP AUM and gross expense ratio data.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Management fees retained by Fidelity.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Management fees retained by Fidelity.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  methodology,
  breakdownMethodology,
  runAtCurrTime: true,
  start: "2024-07-31",
};

export default adapter;
