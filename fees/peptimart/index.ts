import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FEES_API = "https://peptimart.xyz/api/defillama/fees";

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
  SupplySideRevenue:
    "Ten percent of gross merchandise sales allocated to the $PEPTI buyback program.",
  Revenue:
    "Net protocol revenue from store sales after the ten percent buyback allocation.",
  HoldersRevenue:
    "On-chain $PEPTI permanently burned during the day. This is supply reduction, not protocol revenue.",
  ProtocolRevenue:
    "Net revenue retained for PEPTIDES store operations after the buyback allocation.",
};

const breakdownMethodology = {
  Fees: {
    "Merchandise Sales":
      "Total paid checkout value at PEPTIDES for the calendar day (UTC).",
  },
  HoldersRevenue: {
    "Merchandise Sales to Buybacks":
      "Ten percent of gross merchandise sales allocated to the $PEPTI buyback program.",
  },
  ProtocolRevenue: {
    "Merchandise Sales to Store Operations":
      "Net revenue retained for PEPTIDES store operations after the buyback allocation.",
  },
  Revenue: {
    "Merchandise Sales to Buybacks":
      "Ten percent of gross merchandise sales allocated to the $PEPTI buyback program.",
    "Merchandise Sales to Store Operations":
      "Net revenue retained for PEPTIDES store operations after the buyback allocation.",
  },
};

const fetch = async (options: FetchOptions) => {
  const response = (await fetchURL(
    `${FEES_API}?date=${options.dateString}`,
  )) as ApiResponse;

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
