import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import { sleep } from "../utils/utils";

const API_BASE = "https://api.mainnet.hiro.so/extended/v1";
const MICROSTX_PER_STX = 1e6;
const TX_PAGE_SIZE = 50;
const MAX_RETRIES = 8;
const TRANSACTION_FEES_LABEL = "Transaction Fees";
const TRANSACTION_FEES_TO_MINERS_LABEL = "Transaction Fees To Miners";

type HiroTransactionsResponse = {
  results: Array<{
    fee_rate: string;
    canonical?: boolean;
  }>;
};

function isRetryableError(error: any) {
  const message = `${error?.message ?? ""} ${error?.axiosError ?? ""}`.toLowerCase();
  return message.includes("too many requests")
    || message.includes("429")
    || message.includes("timeout")
    || message.includes("socket hang up")
    || message.includes("econnreset")
    || message.includes("rate limit");
}

async function fetchJSON<T>(url: string): Promise<T> {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpGet(url) as T;
    } catch (error) {
      lastError = error;

      if (attempt === MAX_RETRIES || !isRetryableError(error))
        throw error;

      await sleep(3000 * (attempt + 1));
    }
  }

  throw lastError;
}

const fetch = async (options: FetchOptions) => {
  let totalFeesMicrostx = 0;
  let offset = 0;

  while (true) {
    const response = await fetchJSON<HiroTransactionsResponse>(
      `${API_BASE}/tx?start_time=${options.startTimestamp}&end_time=${options.endTimestamp}&limit=${TX_PAGE_SIZE}&offset=${offset}&unanchored=false`
    );

    if (!Array.isArray(response.results)) {
      throw new Error("Unexpected Stacks transactions response");
    }

    for (const tx of response.results) {
      if (tx.canonical === false) continue;
      const fee = Number(tx.fee_rate);
      if (!Number.isFinite(fee)) throw new Error(`Invalid Stacks fee: ${tx.fee_rate}`);
      totalFeesMicrostx += fee;
    }

    if (response.results.length < TX_PAGE_SIZE) break;
    offset += TX_PAGE_SIZE;
  }

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  if (totalFeesMicrostx > 0) {
    dailyFees.addCGToken("blockstack", totalFeesMicrostx / MICROSTX_PER_STX, TRANSACTION_FEES_LABEL);
    dailySupplySideRevenue.addCGToken("blockstack", totalFeesMicrostx / MICROSTX_PER_STX, TRANSACTION_FEES_TO_MINERS_LABEL);
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [TRANSACTION_FEES_LABEL]: "Transaction fees paid by users on Stacks, computed by summing paid fees from Hiro's canonical time-bounded transaction endpoint.",
  },
  SupplySideRevenue: {
    [TRANSACTION_FEES_TO_MINERS_LABEL]: "All Stacks transaction fees are paid to miners/block producers rather than burned or sent to a protocol treasury.",
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.STACKS],
  start: "2021-01-14",
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Transaction fees paid by users on Stacks, computed by summing paid fees from Hiro's canonical time-bounded transaction endpoint.",
    Revenue: "None. Stacks transaction fees are not burned and do not flow to a protocol treasury.",
    SupplySideRevenue: "Stacks transaction fees are paid to miners/block producers. The chain is economically sustained by miner coinbase rewards plus these transaction fees, while PoX miners also spend BTC that is transferred to Stackers.",
  },
  breakdownMethodology,
};

export default adapter;