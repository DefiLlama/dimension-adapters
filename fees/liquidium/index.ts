import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

const FEES_API = "https://app.liquidium.fi/api/defi-llama/fees";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  ICP: "internet-computer",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
};

type FeeHistoryItem = {
  poolId: string;
  chain: string;
  asset: string;
  decimals: unknown;
  ledgerId?: string;
  fees: unknown;
  revenue: unknown;
  supplySideRevenue: unknown;
};

type FeeHistoryResponse = {
  success: boolean;
  items: FeeHistoryItem[];
};

function parseRawTokenAmount(rawAmount: unknown): bigint {
  if (typeof rawAmount !== "string" || !/^\d+$/.test(rawAmount)) {
    throw new Error("Liquidium fees API returned an invalid token amount");
  }

  return BigInt(rawAmount);
}

function toTokenAmount(rawAmount: bigint, decimals: unknown): number {
  if (
    typeof decimals !== "number" ||
    !Number.isInteger(decimals) ||
    decimals < 0
  ) {
    throw new Error("Liquidium fees API returned an invalid token amount");
  }

  const divisor = 10 ** decimals;
  if (!Number.isFinite(divisor)) {
    throw new Error("Liquidium fees API returned an invalid token amount");
  }

  const amount = Number(rawAmount) / divisor;
  if (!Number.isFinite(amount)) {
    throw new Error("Liquidium fees API returned an invalid token amount");
  }
  return amount;
}

async function fetch(options: FetchOptions) {
  const query = new URLSearchParams({
    from: new Date(options.startTimestamp * 1000).toISOString(),
    to: new Date(options.endTimestamp * 1000).toISOString(),
  });
  const response = (await httpGet(`${FEES_API}?${query}`)) as FeeHistoryResponse;

  if (response.success !== true || !Array.isArray(response.items)) {
    throw new Error("Liquidium fees API returned an invalid response");
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const item of response.items) {
    const fees = parseRawTokenAmount(item.fees);
    const revenue = parseRawTokenAmount(item.revenue);
    const supplySideRevenue = parseRawTokenAmount(item.supplySideRevenue);

    if (fees !== revenue + supplySideRevenue) {
      throw new Error(
        `Liquidium fees API returned inconsistent accounting for pool ${item.poolId}`,
      );
    }

    const coingeckoId = COINGECKO_IDS[item.asset];
    if (!coingeckoId) {
      throw new Error(`Missing CoinGecko ID for Liquidium asset ${item.asset}`);
    }

    dailyFees.addCGToken(
      coingeckoId,
      toTokenAmount(fees, item.decimals),
      METRIC.BORROW_INTEREST,
    );
    dailyRevenue.addCGToken(
      coingeckoId,
      toTokenAmount(revenue, item.decimals),
      "Borrow Interest To Treasury",
    );
    dailySupplySideRevenue.addCGToken(
      coingeckoId,
      toTokenAmount(supplySideRevenue, item.decimals),
      "Borrow Interest To Lenders",
    );
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  UserFees: "Gross interest accrued by borrowers across Liquidium lending pools.",
  Fees: "Gross interest accrued by borrowers across Liquidium lending pools.",
  Revenue: "The reserve-factor share of borrower interest allocated to the Liquidium treasury.",
  ProtocolRevenue: "The reserve-factor share of borrower interest allocated to the Liquidium treasury.",
  SupplySideRevenue: "Borrower interest allocated to lenders after the Liquidium reserve-factor cut.",
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.BORROW_INTEREST]: "Gross interest accrued by borrowers.",
  },
  Fees: {
    [METRIC.BORROW_INTEREST]: "Gross interest accrued by borrowers.",
  },
  Revenue: {
    "Borrow Interest To Treasury": "Borrow interest allocated to the Liquidium treasury through each pool's reserve factor.",
  },
  ProtocolRevenue: {
    "Borrow Interest To Treasury": "Borrow interest allocated to the Liquidium treasury through each pool's reserve factor.",
  },
  SupplySideRevenue: {
    "Borrow Interest To Lenders": "Borrow interest allocated to lenders after the reserve-factor cut.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ICP],
  start: "2026-02-28",
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
