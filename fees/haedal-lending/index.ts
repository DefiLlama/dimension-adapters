import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEES_REVENUE_URL = "https://haedal.xyz/haedal/liquidity/api/v1/defillama/fees_revenue";
const readUsd = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const fetch = async (options: FetchOptions) => {
  const dayEnd = options.startOfDay + 86400;
  if (options.endTimestamp < dayEnd || dayEnd > Math.floor(Date.now() / 1000))
    throw new Error(`haedal-lending: fees_revenue only serves a completed UTC day, got ${options.dateString}`);

  const url = `${FEES_REVENUE_URL}?${new URLSearchParams({ date: options.dateString })}`;
  const response = await fetchURL(url);
  if (response?.success !== true || response?.code !== 200)
    throw new Error(
      `haedal-lending: fees_revenue failed for ${options.dateString} (code ${JSON.stringify(response?.code)}, msg ${JSON.stringify(response?.msg)})`
    );

  const dailyFeesUsd = readUsd(response?.data?.fee);
  const dailyRevenueUsd = readUsd(response?.data?.revenue);
  if (dailyFeesUsd === null || dailyRevenueUsd === null)
    throw new Error(
      `haedal-lending: unreadable fees_revenue for ${options.dateString} (fee ${JSON.stringify(response?.data?.fee)}, revenue ${JSON.stringify(response?.data?.revenue)})`
    );
  if (dailyRevenueUsd > dailyFeesUsd)
    throw new Error(
      `haedal-lending: api returned ${dailyRevenueUsd} revenue against ${dailyFeesUsd} fees for ${options.dateString}`
    );

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // The endpoint reports the protocol fee in both fields. Depositor yield is not included.
  dailyFees.addUSDValue(dailyFeesUsd, "Vault Fees");
  dailyRevenue.addUSDValue(dailyRevenueUsd, "Protocol Share");
  const dailyProtocolRevenue = dailyRevenue.clone();

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Protocol fees from all visible Haedal lending vaults on that completed UTC day. Depositor yield is not included.",
  Revenue: "The same protocol fees, as reported in the endpoint's revenue field.",
  ProtocolRevenue: "All reported revenue. It is paid to the vault fee recipient.",
};

const breakdownMethodology = {
  Fees: {
    "Vault Fees": "Protocol fees reported for all visible lending vaults on that UTC day.",
  },
  Revenue: {
    "Protocol Share": "Protocol fees reported in the revenue field.",
  },
  ProtocolRevenue: {
    "Protocol Share": "Protocol fees reported in the revenue field, paid to the vault fee recipient.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  start: "2026-08-24",
  methodology,
  breakdownMethodology,
};

export default adapter;
