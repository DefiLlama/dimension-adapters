import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const FEES_API = "https://peptimart.xyz/api/defillama/fees";
/** Origin fallback when Cloudflare bot protection blocks datacenter IPs (e.g. GitHub Actions CI). */
const FEES_API_ORIGIN_FALLBACK =
  "https://pepti-mart-production.up.railway.app/api/defillama/fees";

type FeesPayload = {
  date: string;
  purchasesUsd: number;
  buybackUsd: number;
  orderCount: number;
  burnsCount: number;
  peptiBurned: number;
};

type ApiResponse = {
  ok: boolean;
  data: FeesPayload;
};

const methodology = {
  Fees: "Gross revenue from paid merchandise sales at PEPTIDES.",
  Revenue: "Includes 90% of revenue retained for PEPTIDES store and 10% allocated to the $PEPTI buyback program.",
  HoldersRevenue: "10% of gross merchandise sales allocated to the $PEPTI buyback program.",
  ProtocolRevenue: "90% of revenue retained for PEPTIDES store operations.",
};

const breakdownMethodology = {
  Fees: {
    "Merchandise Sales":
      "Total paid checkout value at PEPTIDES for the calendar day (UTC).",
  },
  HoldersRevenue: {
    "Merchandise Sales to Buybacks":
      "10% of gross merchandise sales allocated to the $PEPTI buyback program.",
  },
  ProtocolRevenue: {
    "Merchandise Sales to Store Operations": "90% of revenue retained for PEPTIDES store operations.",
  },
  Revenue: {
    "Merchandise Sales to Buybacks": "10% of gross merchandise sales allocated to the $PEPTI buyback program.",
    "Merchandise Sales to Store Operations": "90% of revenue retained for PEPTIDES store operations.",
  },
};

function feesRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "defillama-dimension-adapters/1.0",
  };
  const apiKey = process.env.PEPTIMART_FEES_API_KEY?.trim();
  if (apiKey) headers["x-defillama-api-key"] = apiKey;
  return headers;
}

function isForbiddenError(error: unknown): boolean {
  const status =
    (error as { response?: { status?: number } })?.response?.status ??
    (error as { status?: number })?.status;
  return status === 403;
}

async function fetchFeesPayload(dateString: string): Promise<ApiResponse> {
  const query = `?date=${dateString}`;
  const headers = feesRequestHeaders();
  const urls = [`${FEES_API}${query}`, `${FEES_API_ORIGIN_FALLBACK}${query}`];

  let lastError: unknown;
  for (const url of urls) {
    try {
      return (await httpGet(url, { headers })) as ApiResponse;
    } catch (error) {
      lastError = error;
      if (!isForbiddenError(error)) throw error;
    }
  }

  throw lastError;
}

const fetch = async (options: FetchOptions) => {
  const response = await fetchFeesPayload(options.dateString);

  if (!response?.ok || !response.data) {
    throw new Error(`Invalid response from PEPTIDES fees API for ${options.dateString}`);
  }

  const data = response.data;
  const storeOperationsUsd = data.purchasesUsd - data.buybackUsd;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addUSDValue(data.purchasesUsd, "Merchandise Sales");
  dailyProtocolRevenue.addUSDValue(storeOperationsUsd, "Merchandise Sales to Store Operations");
  dailyRevenue.addUSDValue(storeOperationsUsd, "Merchandise Sales to Store Operations");
  dailyRevenue.addUSDValue(data.buybackUsd, "Merchandise Sales to Buybacks");
  dailyHoldersRevenue.addUSDValue(data.buybackUsd, "Merchandise Sales to Buybacks");

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-27",
  methodology,
  breakdownMethodology,
};

export default adapter;
