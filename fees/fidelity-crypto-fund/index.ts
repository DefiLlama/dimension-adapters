import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet, httpPost } from "../../utils/fetchURL";

const FIDELITY_BASE_URL = "https://digital.fidelity.com/prgw/digital/research";
const MANAGEMENT_FEE = 0.0025;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const headers = {
  "user-agent": "Mozilla/5.0",
  "accept": "application/json,text/html",
  "referer": `${FIDELITY_BASE_URL}/quote/dashboard/summary?symbol=FBTC`,
};

const funds = [
  {
    symbol: "FBTC",
    feeStart: 1722470400,
  },
  {
    symbol: "FETH",
    feeStart: 1735689600,
  },
  {
    symbol: "FSOL",
    feeStart: 1779148800,
  },
];

type Fund = typeof funds[number];

function parseNumber(value: any, label: string, symbol: string) {
  const parsed = Number(`${value}`.replace(/[$,%]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Could not parse ${label} for ${symbol} from Fidelity quote API`);
  return parsed;
}

async function getFidelityRequestOptions() {
  const { data, headers: responseHeaders } = await httpGet(`${FIDELITY_BASE_URL}/api/tokens`, { headers }, { withMetadata: true });
  const cookie = (responseHeaders["set-cookie"] ?? []).map((cookie: string) => cookie.split(";")[0]).join("; ");
  return {
    headers: {
      ...headers,
      "content-type": "application/json",
      "origin": "https://digital.fidelity.com",
      "X-CSRF-TOKEN": data.csrfToken,
      cookie,
    },
  };
}

async function getFundAum({ symbol }: Fund, requestOptions: any) {
  const response = await httpPost(`${FIDELITY_BASE_URL}/api/quote`, { symbol }, requestOptions);
  const quoteData = response.quoteData;
  if (!quoteData) throw new Error(`Missing quote data for ${symbol} from Fidelity quote API`);

  const nav = parseNumber(quoteData.etfNavPriceOffer ?? quoteData.navPreviousDay?.value, "NAV", symbol);
  const sharesOutstanding = parseNumber(quoteData.short?.freeFloatShares, "shares outstanding", symbol);
  return nav * sharesOutstanding;
}

async function fetch(_timestamp: number, _chainBlocks: any, options: FetchOptions): Promise<FetchResult> {
  const dailyFees = options.createBalances();
  const activeFunds = funds
    .map((fund) => ({
      ...fund,
      activeDuration: Math.max(options.toTimestamp - Math.max(options.fromTimestamp, fund.feeStart), 0),
    }))
    .filter((fund) => fund.activeDuration);

  const requestOptions = await getFidelityRequestOptions();
  for (const fund of activeFunds) {
    const aum = await getFundAum(fund, requestOptions);
    const managementFee = aum * MANAGEMENT_FEE * fund.activeDuration / ONE_YEAR_IN_SECONDS;

    dailyFees.addUSDValue(managementFee, METRIC.MANAGEMENT_FEES);
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
    [METRIC.MANAGEMENT_FEES]: "0.25% annual management fees on AUM after each fund's waiver period.",
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
