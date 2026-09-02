import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { sleep } from "../utils/utils";

// Fee breakdown documented at https://docs.relay.link/references/api/get-requests
const RELAY_REQUESTS_URL = "https://api.relay.link/requests/v3";
const PAGE_LIMIT = 50;
const MAX_PAGES = 5_000;
const MAX_RETRIES = 3;
const PLATFORM_FEES_LABEL = "Platform Fees";

type RelayFee = {
  usd?: string | number;
};

type RelayRequest = {
  id?: string;
  data?: {
    fees?: {
      actual?: {
        platform?: RelayFee;
      };
    };
  };
};

type RelayRequestsResponse = {
  requests?: RelayRequest[];
  continuation?: string;
};

const fetchPage = async (url: string, apiKey: string): Promise<RelayRequestsResponse> => {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await globalThis.fetch(url, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await sleep(5_000 * 2 ** attempt);
      continue;
    }

    if (response.ok) return await response.json() as RelayRequestsResponse;

    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_RETRIES) {
      throw new Error(`Relay API request failed: HTTP ${response.status} ${body}`);
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5_000 * 2 ** attempt);
  }

  throw new Error("Unreachable Relay retry state.");
};

const fetch = async ({ createBalances, startTimestamp, endTimestamp }: FetchOptions) => {
  const dailyFees = createBalances();
  const apiKey = getEnv("RELAY_API_KEY");

  if (!apiKey) throw new Error("RELAY_API_KEY is required for the Relay fees adapter.");

  let continuation: string | undefined;
  const seenContinuations = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      startTimestamp: String(startTimestamp),
      endTimestamp: String(endTimestamp),
      limit: String(PAGE_LIMIT),
      sortBy: "updatedAt",
      sortDirection: "asc",
      status: "success",
    });
    if (continuation) params.set("continuation", continuation);

    const response = await fetchPage(`${RELAY_REQUESTS_URL}?${params.toString()}`, apiKey);

    if (!Array.isArray(response.requests)) {
      throw new Error("Relay API returned a response without a requests array.");
    }

    response.requests.forEach((request) => {
      const platformFeeUsd = Number(request.data?.fees?.actual?.platform?.usd ?? 0);
      if (!Number.isFinite(platformFeeUsd) || platformFeeUsd < 0) {
        throw new Error(`Relay API returned an invalid platform fee for request ${request.id ?? "unknown"}.`);
      }
      dailyFees.addUSDValue(platformFeeUsd, PLATFORM_FEES_LABEL);
    });

    const nextContinuation = response.continuation;
    if (!nextContinuation) break;
    if (seenContinuations.has(nextContinuation)) {
      throw new Error("Relay API returned a repeated continuation token.");
    }
    seenContinuations.add(nextContinuation);
    continuation = nextContinuation;

    if (page === MAX_PAGES - 1) {
      throw new Error(`Relay API exceeded the ${MAX_PAGES}-page limit.`);
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CHAIN_GLOBAL],
  // Relay's official overview says the product launched in 2024:
  // https://docs.relay.link/what-is-relay
  start: "2024-01-01",
  methodology: {
    Fees: "Platform fees charged by Relay on successful cross-chain requests, using the actual fee reported by Relay.",
    UserFees: "Platform fees are paid by Relay users as part of successful cross-chain requests.",
    Revenue: "Platform fees reported by Relay are treated as protocol revenue; no separate supply-side share is reported by the API.",
    ProtocolRevenue: "Platform fees reported by Relay are treated as retained by the Relay protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [PLATFORM_FEES_LABEL]: "Actual Relay platform fees charged on successful requests, converted from the API's USD value.",
    },
    Revenue: {
      [PLATFORM_FEES_LABEL]: "Platform fees reported by Relay; the API does not expose a separate protocol-retained share.",
    },
    ProtocolRevenue: {
      [PLATFORM_FEES_LABEL]: "Platform fees reported by Relay; the API does not expose a separate protocol-retained share.",
    },
  },
};

export default adapter;
