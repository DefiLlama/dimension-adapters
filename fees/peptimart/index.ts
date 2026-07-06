import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FEES_API = "https://peptimart.xyz/api/defillama/fees";
const PEPTI_MINT = "61aNNrrRp81a3ZztDL69dNyrcshBsqWZdWVSrpYpump";

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
  Fees: "Gross revenue from paid merchandise sales at PEPTI MART.",
  Revenue:
    "Net protocol revenue from store sales after the ten percent buyback allocation.",
  HoldersRevenue:
    "On-chain $PEPTI permanently burned during the day. This is supply reduction, not protocol revenue.",
  ProtocolRevenue:
    "Net revenue retained for PEPTI MART operations after the buyback allocation.",
};

const breakdownMethodology = {
  Fees: {
    "Merchandise Sales":
      "Total paid checkout value at PEPTI MART for the calendar day (UTC).",
  },
  HoldersRevenue: {
    "Token Burns":
      "Total $PEPTI permanently burned on Solana during the calendar day (UTC). Not counted as protocol revenue.",
  },
  ProtocolRevenue: {
    "Store Operations":
      "Gross merchandise sales less the ten percent buyback allocation.",
  },
  Revenue: {
    "Store Operations":
      "Net revenue supporting PEPTI MART operations and catalog.",
  },
};

const fetch = async (options: FetchOptions) => {
  const response = (await fetchURL(
    `${FEES_API}?date=${options.dateString}`,
  )) as ApiResponse;

  if (!response?.ok || !response.data) {
    throw new Error(`Invalid response from PEPTI MART fees API for ${options.dateString}`);
  }

  const data = response.data;
  const storeOperationsUsd = data.purchasesUsd - data.buybackUsd;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addUSDValue(data.purchasesUsd, "Merchandise Sales");
  dailyProtocolRevenue.addUSDValue(storeOperationsUsd, "Store Operations");
  dailyRevenue.addUSDValue(storeOperationsUsd, "Store Operations");

  if (data.peptiBurned > 0) {
    const raw = Math.round(data.peptiBurned * 1e6).toString();
    dailyHoldersRevenue.add(PEPTI_MINT, raw, "Token Burns");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-27",
  methodology,
  breakdownMethodology,
};

export default adapter;
