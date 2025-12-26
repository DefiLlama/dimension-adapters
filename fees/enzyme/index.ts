import axios from "axios";
import { FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://api.onyx.enzyme.finance";
const LIST_URL = "https://api.enzyme.finance/enzyme.enzyme.v1.EnzymeService/GetVaultList";

// 🚨 Required: API key from .env
const API_KEY = process.env.ENZYME_API_KEY;
if (!API_KEY) throw new Error("❌ ENZYME_API_KEY missing in .env");


const getVaultList = async () => {
  const { data } = await axios.post(
    LIST_URL,
    {},
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  return data.vaults || [];
};

const getVaultConfig = async (address: string) => {
  try {
    const { data } = await axios.get(
      `${BASE_URL}/vaults/${address}/configuration`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );
    return data;
  } catch {
    return null;
  }
};


const getVaultSettledFees = async (vault: any) => {
  const config = await getVaultConfig(vault.address);
  if (!config?.feeHandler) return 0;

  const handler = config.feeHandler;
  const trackers = [
    "continuous-flat-rate-performance-fee-tracker",
    "continuous-flat-rate-management-fee-tracker",
  ];

  let total = BigInt(0);

  for (const t of trackers) {
    try {
      const { data } = await axios.get(
        `${BASE_URL}/vaults/${vault.address}/components/${t}/${handler}`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      total += BigInt(data.totalFeesSettled || 0);
    } catch {}
  }

  // Return in ETH
  return Number(total) / 1e18;
};


const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const vaults = await getVaultList();

  let totalEth = 0;
  let activeVaults = 0;

  for (const v of vaults) {
    const value = await getVaultSettledFees(v);
    if (value > 0) {
      activeVaults++;
      totalEth += value;
    }
  }

  return {
    timestamp,
    dailyFees: totalEth,
    dailyRevenue: totalEth,
    dailyProtocolRevenue: totalEth,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1640995200, // 2022-01-01 (valid historical)
    },
  },
  methodology: {
    Fees: "Total settled performance + management fees from Enzyme fee handler trackers.",
    Revenue: "Uses totalFeesSettled from fee-tracker components on-chain.",
    Notes: "Daily outputs may be 0 because Enzyme settles fees irregularly, not every day.",
  },
};

export default adapter;