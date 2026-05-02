import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const NAV_API = "https://core.api.onre.finance/data/nav"\;

interface NAVEntry {
  net_asset_value_date: string;
  net_asset_value: string;
  assets_under_management: string | null;
  circulating_supply: string | null;
}

const formatUTCDate = (ts: number): string => {
  const d = new Date(ts * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response = await fetchURL(NAV_API);
  const navData: NAVEntry[] = response.data;

  const todayStr = formatUTCDate(options.startOfDay);
  const yesterdayStr = formatUTCDate(options.startOfDay - 86400);

  const today = navData.find((e) => e.net_asset_value_date === todayStr);
  const yesterday = navData.find((e) => e.net_asset_value_date === yesterdayStr);

  if (!today || !yesterday || !today.assets_under_management) {
    return { dailyFees: 0, dailySupplySideRevenue: 0, dailyRevenue: 0 };
  }

  const todayNAV = parseFloat(today.net_asset_value);
  const yesterdayNAV = parseFloat(yesterday.net_asset_value);
  const aum = parseFloat(today.assets_under_management);

  if (
    !Number.isFinite(todayNAV) ||
    !Number.isFinite(yesterdayNAV) ||
    !Number.isFinite(aum) ||
    yesterdayNAV <= 0
  ) {
    return { dailyFees: 0, dailySupplySideRevenue: 0, dailyRevenue: 0 };
  }

  const dailyFees = aum * ((todayNAV - yesterdayNAV) / yesterdayNAV);

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  };
};

const methodology = {
  Fees: "Yield accrued to ONyc token holders as the NAV increases daily (AUM × daily NAV growth rate).",
  SupplySideRevenue: "All yield goes to token holders.",
  Revenue: "No protocol fee split.",
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2025-06-04",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
