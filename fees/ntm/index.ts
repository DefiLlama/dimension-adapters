import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { proxiedFetch } from "../../utils/fetchURL";

// api.ntm.ai answers normally from a residential IP and returns 403 to a
// datacenter IP, which is why nothing has been published since 2026-07-29.
// Routed through the shared proxy, the same treatment aggregators/houdiniswap
// and fees/space-and-time already use. proxiedFetch falls back to a direct
// request when PROXY_AUTH is unset, so local runs and CI are unchanged.
const endpoint = "https://api.ntm.ai/feesAndRevenues.php?";
const chainToken: Record<string, string> = {
  [CHAIN.TON]: "the-open-network",
  [CHAIN.AVAX]: "avalanche-2",
  [CHAIN.BSC]: "binancecoin",
  [CHAIN.ETHEREUM]: "ethereum",
  [CHAIN.TRON]: "tron",
  [CHAIN.SOLANA]: "solana",
};

const fetchFeesAndRevenues = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000)
    .toISOString()
    .split(".")[0];
  const endTime = new Date(options.endTimestamp * 1000)
    .toISOString()
    .split(".")[0];
  const url = `${endpoint}start_date=${startTime}&end_date=${endTime}&chain=${options.chain}`;
  const res = await proxiedFetch(url);

  // Reject anything that is not a real number before it reaches addCGToken.
  // Number(undefined) is NaN and Number(null)/Number("")/Number(" ")/Number([])
  // are all a finite 0, so a non-JSON body or a changed field name would
  // otherwise land as a silent zero or an unreadable NaN instead of an error
  // naming the endpoint. Only a number or a non-blank string is accepted.
  const readAmount = (raw: unknown, field: string): number => {
    const usable =
      typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "");
    if (!usable) {
      throw new Error(`ntm: missing or non-numeric ${field} (${JSON.stringify(raw)}) from ${url}`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`ntm: unusable ${field} (${JSON.stringify(raw)}) from ${url}`);
    }
    return value;
  };

  const token = chainToken[options.chain];
  if (!token) throw new Error(`ntm: no coingecko id mapped for chain ${options.chain}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  dailyFees.addCGToken(token, readAmount(res?.fees_total, "fees_total"));
  dailyRevenue.addCGToken(token, readAmount(res?.revenue_total, "revenue_total"));

  return { dailyFees, dailyRevenue };
};

const adapter: any = {
  version: 2,
  methodology: {
    Fees: "Sums the fees of listing request & trending request.",
    Revenue: "Sums the fees of listing request & trending request.",
  },
  fetch: fetchFeesAndRevenues,
  start: "2023-05-22",
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.BSC,
    CHAIN.AVAX,
    CHAIN.SOLANA,
    CHAIN.TRON,
    CHAIN.TON,
  ],
};

export default adapter;
