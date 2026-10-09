import { request } from "graphql-request";
import { Balances } from "@defillama/sdk";
import { FetchOptions, FetchResult } from "../adapters/types";
import { METRIC } from "./metrics";

// Pool versions as named by the Sundae API (`Version` enum)
export type SundaeVersion = "V1" | "V3" | "Stableswaps" | "V4";

const ADA_ID = "ada.lovelace";
const endpoint = "https://api.sundae.fi/graphql";
const HOLDERS_REVENUE_START_TIMESTAMP = 1715212800; //2024-05-09
const HOLDERS_REVENUE_SHARE_PERCENT = 15n; // 15% of protocol fees go to holders since 2024-05-09, 85% to treasury

// the Sundae API only lists the 50 largest pools by TVL across all versions, as of query time (`popular` takes no date), see `query`
const COVERAGE_NOTE = "Only the 50 largest SundaeSwap pools by current TVL (across all versions) are counted, and the same current set is used for past dates, so pools that were large in the past but are not in today's top 50 are excluded.";

const formatDate = (ts: number) => {
  return new Date(ts * 1000).toISOString().replace('T', ' ').substring(0, 19);
};

const formatAsset = (assetId: string) => {
  const [policy, name] = assetId.split(".");
  return name ? policy + name : assetId;
};

const addAmount = (
  balanceObj: Balances,
  assetId: string,
  quantity: bigint,
  label?: string,
) => {
  if (!assetId) return;

  if (assetId === ADA_ID) {
    balanceObj.addGasToken(quantity, label);
  } else {
    balanceObj.addToken(formatAsset(assetId), quantity, label);
  }
};

// `popular` returns the top 50 pools by TVL across all versions; the API has no per-version pool listing
const query = `
  query fetchPools($start: String!, $end: String!) {
    pools {
      popular {
        version
        ticks(start: $start, end: $end, interval: Daily) {
          rich {
            start { unixMilli }
            protocolFees { quantity asset { id } }
            lpFees(unit: Natural) { quantity asset { id } }
          }
        }
      }
    }
  }
`;

/**
 * Builds a fees fetch that counts only pools of the given Sundae API versions.
 */
export const getFetch = (versions: SundaeVersion[]) => async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const start = formatDate(options.startTimestamp);
  // `end` is inclusive on the API side, so stop one second short of the next day's tick
  const end = formatDate(options.endTimestamp - 1);
  const holdersShare = options.startTimestamp >= HOLDERS_REVENUE_START_TIMESTAMP ? HOLDERS_REVENUE_SHARE_PERCENT : 0n;

  const data = await request(endpoint, query, { start, end });
  const allPools = data?.pools?.popular;
  if (!allPools?.length) throw new Error("Sundae API returned no pools");
  const pools = allPools.filter((pool: any) => versions.includes(pool.version));

  for (const pool of pools) {
    for (const tick of pool.ticks?.rich ?? []) {
      // guard against ticks outside the window
      const tickStart = Number(tick.start.unixMilli) / 1e3;
      if (tickStart < options.startTimestamp || tickStart >= options.endTimestamp) continue;

      const { lpFees, protocolFees } = tick;

      if (lpFees?.asset?.id) {
        const quantity = BigInt(lpFees.quantity);
        addAmount(dailyFees, lpFees.asset.id, quantity, METRIC.LP_FEES);
        addAmount(dailySupplySideRevenue, lpFees.asset.id, quantity, 'LP Fees To LPs');
      }

      if (protocolFees?.asset?.id) {
        const quantity = BigInt(protocolFees.quantity);
        const holdersQuantity = quantity * holdersShare / 100n;
        addAmount(dailyFees, protocolFees.asset.id, quantity, METRIC.PROTOCOL_FEES);
        addAmount(dailyRevenue, protocolFees.asset.id, quantity, METRIC.PROTOCOL_FEES);
        addAmount(dailyHoldersRevenue, protocolFees.asset.id, holdersQuantity, 'Protocol Fees To Holders');
        addAmount(dailyProtocolRevenue, protocolFees.asset.id, quantity - holdersQuantity, 'Protocol Fees To Treasury');
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

export const methodology = {
  Fees: `The total trading fees paid by users, excluding L1 transaction fees. ${COVERAGE_NOTE}`,
  Revenue: `A fixed ADA cost per transaction that is collected by the protocol. ${COVERAGE_NOTE}`,
  SupplySideRevenue: `A percentage cut on all trading volume, paid to Liquidity Providers. ${COVERAGE_NOTE}`,
  ProtocolRevenue: `The share of the fixed ADA cost per transaction kept by the treasury: 85% since May 2024, 100% before. ${COVERAGE_NOTE}`,
  HoldersRevenue: `The share of the fixed ADA cost per transaction going to holders: 15% since May 2024, 0% before. ${COVERAGE_NOTE}`
};

export const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "A percentage cut on all trading volume, paid to Liquidity Providers",
    [METRIC.PROTOCOL_FEES]: "A fixed ADA cost per transaction that is collected by the protocol"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "A fixed ADA cost per transaction that is collected by the protocol"
  },
  SupplySideRevenue: {
    'LP Fees To LPs': "A percentage cut on all trading volume, paid to Liquidity Providers"
  },
  ProtocolRevenue: {
    'Protocol Fees To Treasury': "The share of protocol fees kept by the treasury"
  },
  HoldersRevenue: {
    'Protocol Fees To Holders': "The share of protocol fees going to holders"
  }
};

const volumeQuery = `
  query fetchPoolVolume($start: String!, $end: String!) {
    pools {
      popular {
        version
        ticks(start: $start, end: $end, interval: Daily) {
          rich {
            start { unixMilli }
            volume(unit: AssetA) { quantity asset { id } }
          }
        }
      }
    }
  }
`;

/**
 * Builds a volume fetch that counts only pools of the given Sundae API versions.
 * Tick volume is one-sided: LP fees / volume equals the pool fee rate.
 */
export const getVolumeFetch = (versions: SundaeVersion[]) => async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();

  const start = formatDate(options.startTimestamp);
  // `end` is inclusive on the API side, so stop one second short of the next day's tick
  const end = formatDate(options.endTimestamp - 1);

  const data = await request(endpoint, volumeQuery, { start, end });
  const allPools = data?.pools?.popular;
  if (!allPools?.length) throw new Error("Sundae API returned no pools");
  const pools = allPools.filter((pool: any) => versions.includes(pool.version));

  for (const pool of pools) {
    for (const tick of pool.ticks?.rich ?? []) {
      // guard against ticks outside the window
      const tickStart = Number(tick.start.unixMilli) / 1e3;
      if (tickStart < options.startTimestamp || tickStart >= options.endTimestamp) continue;

      if (tick.volume?.asset?.id) addAmount(dailyVolume, tick.volume.asset.id, BigInt(tick.volume.quantity));
    }
  }

  return { dailyVolume };
};

export const volumeMethodology = {
  Volume: `Swap volume across SundaeSwap pools, counted once per trade in the pool's first asset. ${COVERAGE_NOTE}`,
};
