import { gql, request } from "graphql-request";

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getLegNotionalAmount, PanopticLeg } from "./notional";

// Panoptic V2 indexed on-chain activity API.
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cl9gc21q105380hxuh8ks53k3/subgraphs/panoptic-subgraph-mainnet/v2_prod/gn";
// Panoptic /info historical accrued-premium API.
const PREMIUM_ENDPOINT = "https://app.panoptic.xyz/data/info-streamia-snapshot";
// The Graph caps collection queries at 1,000 entities, after which they must be paginated:
// https://thegraph.com/docs/en/subgraphs/developing/developer-faq/#is-there-a-limit-to-how-many-objects-the-graph-can-return-per-query
const PAGE_SIZE = 1000;
const OPTION_NOTIONAL = "Option Mint and Burn Notional";
const STREAMING_PREMIUM = "Accrued Streaming Premium";
const PROTOCOL_COMMISSION_FEES = "Protocol Option Commissions";
const BUILDER_COMMISSION_FEES = "Builder Option Commissions";
const PROTOCOL_COMMISSION_REVENUE = "Protocol Option Commissions To Treasury";
const BUILDER_COMMISSION_REVENUE = "Builder Option Commissions To Protocol";

const DAILY_ACTIVITY_QUERY = gql`
  query DailyActivity(
    $startTimestamp: BigInt!
    $endTimestamp: BigInt!
    $pageSize: Int!
    $skip: Int!
  ) {
    optionMints(
      first: $pageSize
      skip: $skip
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gte: $startTimestamp, timestamp_lt: $endTimestamp }
    ) {
      positionSize
      tokenId {
        pool {
          tickSpacing
          token0 {
            id
          }
          token1 {
            id
          }
        }
        legs {
          asset
          optionRatio
          strike
          tokenType
          width
        }
      }
    }
    optionBurns(
      first: $pageSize
      skip: $skip
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gte: $startTimestamp, timestamp_lt: $endTimestamp }
    ) {
      positionSize
      tokenId {
        pool {
          tickSpacing
          token0 {
            id
          }
          token1 {
            id
          }
        }
        legs {
          asset
          optionRatio
          strike
          tokenType
          width
        }
      }
    }
    commissionPaids(
      first: $pageSize
      skip: $skip
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gte: $startTimestamp, timestamp_lt: $endTimestamp }
    ) {
      commissionPaidBuilder
      commissionPaidProtocol
      collateral {
        token {
          id
        }
      }
    }
  }
`;

type OptionEvent = {
  positionSize: string;
  tokenId: {
    legs: PanopticLeg[];
    pool: {
      tickSpacing: string;
      token0: { id: string };
      token1: { id: string };
    };
  };
};

type CommissionPaid = {
  collateral: { token: { id: string } };
  commissionPaidBuilder: string;
  commissionPaidProtocol: string;
};

type ActivityPage = {
  commissionPaids: CommissionPaid[];
  optionBurns: OptionEvent[];
  optionMints: OptionEvent[];
};

type PremiumSnapshot = {
  data: {
    chainId: number;
    unavailableReason: string | null;
    values: {
      grossPanopticPremiumUsd: string;
    };
  };
};

async function fetchActivityPages(options: FetchOptions): Promise<ActivityPage[]> {
  const pages: ActivityPage[] = [];
  let skip = 0;

  while (true) {
    const page = await request<ActivityPage>(SUBGRAPH_URL, DAILY_ACTIVITY_QUERY, {
      startTimestamp: options.startTimestamp.toString(),
      endTimestamp: options.endTimestamp.toString(),
      pageSize: PAGE_SIZE,
      skip,
    });
    pages.push(page);

    const hasAnotherPage =
      page.optionMints.length === PAGE_SIZE ||
      page.optionBurns.length === PAGE_SIZE ||
      page.commissionPaids.length === PAGE_SIZE;
    if (!hasAnotherPage) break;

    skip += PAGE_SIZE;
  }

  return pages;
}

async function fetchPremiumUsd(dateString: string): Promise<number> {
  const response = (await fetchURL(
    `${PREMIUM_ENDPOINT}?from=${dateString}&to=${dateString}`,
  )) as PremiumSnapshot;

  if (response.data.chainId !== 1) {
    throw new Error(`Expected Ethereum premium snapshot, got chain ${response.data.chainId}`);
  }
  if (response.data.unavailableReason !== null) {
    throw new Error(`Panoptic premium snapshot unavailable: ${response.data.unavailableReason}`);
  }

  const premiumUsd = Number(response.data.values.grossPanopticPremiumUsd);
  if (!Number.isFinite(premiumUsd) || premiumUsd < 0) {
    throw new Error(
      `Invalid Panoptic premium snapshot value ${response.data.values.grossPanopticPremiumUsd}`,
    );
  }
  return premiumUsd;
}

async function fetch(options: FetchOptions) {
  const [pages, premiumUsd] = await Promise.all([
    fetchActivityPages(options),
    fetchPremiumUsd(options.dateString),
  ]);
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyPremiumVolume.addUSDValue(premiumUsd, STREAMING_PREMIUM);

  for (const page of pages) {
    for (const event of [...page.optionMints, ...page.optionBurns]) {
      const tokens = [event.tokenId.pool.token0.id, event.tokenId.pool.token1.id];
      for (const leg of event.tokenId.legs) {
        const notional = getLegNotionalAmount(
          leg,
          BigInt(event.positionSize),
          BigInt(event.tokenId.pool.tickSpacing),
        );
        dailyNotionalVolume.add(
          tokens[notional.tokenType],
          notional.amount,
          OPTION_NOTIONAL,
        );
      }
    }

    for (const commission of page.commissionPaids) {
      const token = commission.collateral.token.id;
      const protocolAmount = BigInt(commission.commissionPaidProtocol);
      const builderAmount = BigInt(commission.commissionPaidBuilder);

      dailyFees.add(token, protocolAmount, PROTOCOL_COMMISSION_FEES);
      dailyFees.add(token, builderAmount, BUILDER_COMMISSION_FEES);
      dailyRevenue.add(token, protocolAmount, PROTOCOL_COMMISSION_REVENUE);
      dailyRevenue.add(token, builderAmount, BUILDER_COMMISSION_REVENUE);
    }
  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-04-06",
  methodology: {
    NotionalVolume:
      "Gross underlying exposure of every Panoptic V2 option leg minted or burned. The raw token amounts use the same position-size and geometric-mean tick-range calculation as Panoptic's /info analytics and are valued by DefiLlama.",
    PremiumVolume:
      "Gross streaming premium accrued during the UTC day, including premium accrued by positions that remain open. Panoptic calculates this from Uniswap fee-growth deltas and Panoptic's utilization spread at historical blocks.",
    Fees:
      "All protocol and builder commissions charged by Panoptic V2 during the UTC day.",
    Revenue:
      "All Panoptic V2 protocol and builder commissions. Builder commissions currently belong to the Panoptic protocol, so revenue equals fees.",
    ProtocolRevenue:
      "All Panoptic V2 protocol and builder commissions currently controlled by the Panoptic protocol treasury.",
  },
  breakdownMethodology: {
    NotionalVolume: {
      [OPTION_NOTIONAL]:
        "Gross underlying exposure of all Panoptic V2 option legs minted and burned.",
    },
    PremiumVolume: {
      [STREAMING_PREMIUM]:
        "Streaming premium accrued by Panoptic V2 positions during the UTC day.",
    },
    Fees: {
      [PROTOCOL_COMMISSION_FEES]:
        "Option commission recorded on-chain as commissionPaidProtocol.",
      [BUILDER_COMMISSION_FEES]:
        "Option commission recorded on-chain as commissionPaidBuilder.",
    },
    Revenue: {
      [PROTOCOL_COMMISSION_REVENUE]:
        "Protocol option commission paid to the Panoptic-controlled treasury.",
      [BUILDER_COMMISSION_REVENUE]:
        "Builder option commission currently owned by the Panoptic protocol.",
    },
    ProtocolRevenue: {
      [PROTOCOL_COMMISSION_REVENUE]:
        "Protocol option commission paid to the Panoptic-controlled treasury.",
      [BUILDER_COMMISSION_REVENUE]:
        "Builder option commission currently owned by the Panoptic protocol.",
    },
  },
};

export default adapter;
