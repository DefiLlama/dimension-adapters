import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API_BASE = "https://inflow-vault-metrics-brnuh.ondigitalocean.app/fees";
const LIMIT = 200;

const VAULTS = [
  { vault: "usdc", cgToken: "usd-coin", decimals: 1e6 },
  { vault: "atom", cgToken: "cosmos",   decimals: 1e6 },
  { vault: "btc",  cgToken: "bitcoin",  decimals: 1e8 },
];

const fetch = async (options: FetchOptions) => {
  const { fromTimestamp, toTimestamp, createBalances } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();    // no fees go to protocol

  for (const { vault, cgToken, decimals } of VAULTS) {
    const url = `${API_BASE}?vault=${vault}&limit=${LIMIT}`;
    const entries: { Timestamp: number; BaseTokenAmount: number }[] = await fetchURL(url);

    const total = entries
      .filter((e) => e.Timestamp >= fromTimestamp && e.Timestamp <= toTimestamp)
      .reduce((sum, e) => sum + e.BaseTokenAmount, 0);

    dailyFees.addCGToken(cgToken, total / decimals);
    dailyRevenue.addCGToken(cgToken, total / decimals);
    dailyHoldersRevenue.addCGToken(cgToken, total / decimals);
  }

  return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.NEUTRON]: {
      fetch,
      start: "2026-03-05",
    },
  },
};

export default adapter;
