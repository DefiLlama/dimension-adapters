// https://docs.superstate.co/ustb/income-fees-and-yield
// https://docs.superstate.co/uscc/income-fees-and-yield

import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const _fundsAddresses: string[] = [
  "0x43415eb6ff9db7e26a15b704e7a3edce97d31c4e",
  "0x14d60e7fdc0d71d8611742720e4c50e7a974020c",
];

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function findDailyData(data: any[], targetDate: string) {
  return data.find((item: any) => item.net_asset_value_date === targetDate);
}

async function getFundsFees(timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> {
  let ustbTotalFees: number = 0;
  let usccTotalFees: number = 0;

  const targetDate = formatDate(new Date(options.startOfDay * 1000));

  const [ustbRes, usccRes] = await Promise.all([
    httpGet("https://api.superstate.co/v1/funds/1/nav-daily"),
    httpGet("https://api.superstate.co/v1/funds/2/nav-daily"),
  ])

  const ustbDailyData = findDailyData(ustbRes, targetDate);
  const usccDailyData = findDailyData(usccRes, targetDate);

  if (ustbDailyData) {
    const { assets_under_management } = ustbDailyData;
    if (assets_under_management > 200 * 1e6) {
      // no fees until 200 MM AUM
      ustbTotalFees = (assets_under_management * 0.15) / 100; // 0.15bps
    }
  }

  if (usccDailyData) {
    const { assets_under_management } = usccDailyData;
    if (assets_under_management > 50 * 1e6) {
      // no fees until 50 MM AUM
      usccTotalFees = (assets_under_management * 0.75) / 100; // 0.75bps
    }
  }

  return {
    timestamp,
    dailyFees: (ustbTotalFees + usccTotalFees) / 365,
    totalFees: ustbTotalFees + usccTotalFees,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: getFundsFees,
      start: 1709247600,
      runAtCurrTime: false,
    },
  },
};

export default adapter;
