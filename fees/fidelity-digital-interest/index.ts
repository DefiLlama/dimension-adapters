import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet, httpPost } from "../../utils/fetchURL";

const FDIT = "0x48ab4e39ac59f4e88974804b04a991b3a402717f";
const FUND_NO = "9053";
// Fidelity public fund data for FYOXX / FDIT:
// https://institutional.fidelity.com/app/fund/data/9053.json
// Historical prices/yields form posts to this endpoint with fundNo/startDate/endDate.
// https://institutional.fidelity.com/app/funds/hpdy
const FIDELITY_FUND_DATA_URL = "https://institutional.fidelity.com/app/fund/data/9053.json";
const FIDELITY_HISTORICAL_PRICING_URL = "https://institutional.fidelity.com/app/funds/historicalFundPricing";
const FDIT_DIVIDENDS = "FDIT Dividends";
const FDIT_DIVIDENDS_TO_HOLDERS = "FDIT Dividends To Holders";
const FDIT_NET_FUND_EXPENSES = "FDIT Net Fund Expenses";
const FDIT_NET_FUND_EXPENSES_TO_FIDELITY = "FDIT Net Fund Expenses To Fidelity";

type FidelityFeatureInformation = {
  featureCode: string;
  featureValue: string;
}[];

type PricingData = {
  milRate?: number;
  featureInformation?: FidelityFeatureInformation;
};

type HistoricalPricingResponse = {
  status: string;
  featureInformation?: FidelityFeatureInformation;
  prices?: {
    date: string;
    milRate: string;
  }[];
};

type FundDataResponse = {
  historicalPricingYield?: {
    prices?: {
      date: string;
      milRateAndYieldInstance?: {
        milRate: number | string;
      };
    }[];
  }[];
  overview?: {
    featureInformation?: FidelityFeatureInformation;
  };
  prices?: {
    milrateYields?: {
      milrateDate: string;
      milrate: number | string;
    }[];
  }[];
};

function toFidelityDate(dateString: string) {
  const [year, month, day] = dateString.split("-");
  return `${month}/${day}/${year}`;
}

function fromFidelityDate(dateString: string) {
  const [month, day, year] = dateString.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parsePercent(value?: string) {
  if (!value) return undefined;

  const match = value.match(/[\d.]+/);
  if (!match) return undefined;

  return Number(match[0]) / 100;
}

function getNetExpenseRatio(features: FidelityFeatureInformation = []) {
  const byCode = Object.fromEntries(features.map((feature) => [feature.featureCode, feature.featureValue]));
  // Fidelity feature codes:
  // ERAER = expenses net of all reductions, NTEXP = total annual operating expenses after waiver/reimbursement,
  // MGFEE = management fee. SEC summary prospectus lists 0.25% gross management fee and 0.20% net expenses.
  // https://www.sec.gov/Archives/edgar/data/917286/000113322825007437/ftdf-efp16750_497k.htm
  const netExpenseRatio =
    parsePercent(byCode.ERAER) ??
    parsePercent(byCode.NTEXP) ??
    parsePercent(byCode.MGFEE);

  if (netExpenseRatio === undefined) {
    throw new Error("No Fidelity expense ratio found");
  }

  return netExpenseRatio;
}

async function getHistoricalPricing(dateString: string): Promise<PricingData> {
  const date = toFidelityDate(dateString);
  const body = new URLSearchParams({
    fundNo: FUND_NO,
    startDate: date,
    endDate: date,
  });

  const response: HistoricalPricingResponse = await httpPost(
    FIDELITY_HISTORICAL_PRICING_URL,
    body.toString(),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
    }
  );

  if (response.status !== "success") {
    throw new Error(`Fidelity historical pricing request failed for ${dateString}`);
  }

  const price = response.prices?.find((item) => item.date === dateString);
  return {
    milRate: price?.milRate ? Number(price.milRate) : undefined,
    featureInformation: response.featureInformation,
  };
}

async function getFundDataPricing(dateString: string): Promise<PricingData> {
  const response: FundDataResponse = await httpGet(FIDELITY_FUND_DATA_URL);
  const featureInformation = response.overview?.featureInformation;
  const historicalPrice = response.historicalPricingYield
    ?.flatMap((item) => item.prices ?? [])
    .find((item) => item.date === toFidelityDate(dateString));

  if (historicalPrice?.milRateAndYieldInstance?.milRate) {
    return {
      milRate: Number(historicalPrice.milRateAndYieldInstance.milRate),
      featureInformation,
    };
  }

  const milrateYield = response.prices
    ?.flatMap((price) => price.milrateYields ?? [])
    .find((item) => fromFidelityDate(item.milrateDate) === dateString);

  return {
    milRate: milrateYield?.milrate ? Number(milrateYield.milrate) : undefined,
    featureInformation,
  };
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  let pricing = await getFundDataPricing(options.dateString);

  if (pricing.milRate === undefined) {
    pricing = await getHistoricalPricing(options.dateString);
  }

  if (pricing.milRate === undefined) {
    throw new Error(`No Fidelity mil-rate found for ${options.dateString}`);
  }

  const supply = await options.fromApi.call({
    target: FDIT,
    abi: "erc20:totalSupply",
  });

  const fditSupply = Number(supply) / 1e18;
  const netExpenseRatio = getNetExpenseRatio(pricing.featureInformation);
  const periodInYears = (options.endTimestamp - options.startTimestamp) / (365 * 24 * 60 * 60);

  const dailyDividends = fditSupply * pricing.milRate;
  const dailyFundFees = fditSupply * netExpenseRatio * periodInYears;

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Fidelity money market mil-rates are daily dividend amounts per $1 NAV share.
  // Because FDIT/FYOXX targets a $1 NAV, supply in shares is also the USD AUM base for these calculations.
  dailyFees.addUSDValue(dailyDividends, FDIT_DIVIDENDS);
  dailyFees.addUSDValue(dailyFundFees, FDIT_NET_FUND_EXPENSES);
  dailySupplySideRevenue.addUSDValue(dailyDividends, FDIT_DIVIDENDS_TO_HOLDERS);
  dailyRevenue.addUSDValue(dailyFundFees, FDIT_NET_FUND_EXPENSES_TO_FIDELITY);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Daily dividends paid to FDIT holders plus fund expenses accrued by Fidelity Treasury Digital Fund - OnChain Class.",
  Revenue: "Net annual operating expenses after fee waivers or reimbursements, accrued daily on FDIT AUM.",
  ProtocolRevenue: "Net annual operating expenses after fee waivers or reimbursements, accrued daily on FDIT AUM.",
  SupplySideRevenue: "Daily dividends paid to FDIT holders, calculated from Fidelity's daily mil-rate and start-of-day FDIT supply.",
};

const breakdownMethodology = {
  Fees: {
    [FDIT_DIVIDENDS]: "Daily dividends paid to FDIT holders from Fidelity's published mil-rate.",
    [FDIT_NET_FUND_EXPENSES]: "Net fund expenses accrued daily using Fidelity's expense ratio.",
  },
  Revenue: {
    [FDIT_NET_FUND_EXPENSES_TO_FIDELITY]: "Net fund expenses accrued daily to Fidelity using Fidelity's expense ratio.",
  },
  ProtocolRevenue: {
    [FDIT_NET_FUND_EXPENSES_TO_FIDELITY]: "Net fund expenses accrued daily to Fidelity using Fidelity's expense ratio.",
  },
  SupplySideRevenue: {
    [FDIT_DIVIDENDS_TO_HOLDERS]: "Daily dividends paid to FDIT holders from Fidelity's published mil-rate.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-08-04",
    },
  },
};

export default adapter;
