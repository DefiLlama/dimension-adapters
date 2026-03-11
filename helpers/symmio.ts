import request from "graphql-request";
import { Adapter, Chain, Fetch } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { CHAIN } from "./chains";

type DailyHistory = {
  platformFee: string
  symmioShare: string
  tradeVolume: string
  day: string
  accountSource: string
  openInterest: string
}

type SymmioEntity = {
  id: string
  address: string
  name: string
  type: string
}

export const BUILDER_METHODOLOGY = {
  Volume: 'builder code volume from Symmio Perps Trades.',
  Fees: 'builder code fees from Symmio Perps Trades.',
  Revenue: 'builder code revenue from Symmio Perps Trades.',
  ProtocolRevenue: 'builder code revenue from Symmio Perps Trades.',
  OpenInterest: 'builder code openInterest from Symmio Perps Trades.',
};

const config: Partial<Record<Chain, string>> = {
  [CHAIN.ARBITRUM]: 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/arbitrum_analytics/latest/gn',
  [CHAIN.BASE]: 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/base_analytics/latest/gn',
  [CHAIN.BSC]: 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/bnb_analytics/latest/gn',
  [CHAIN.MANTLE]: 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/mantle_analytics/latest/gn',
  [CHAIN.BERACHAIN]:'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/bera_analytics/latest/gn',
  [CHAIN.MODE]: 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/mode_analytics/latest/gn',
  [CHAIN.SONIC]: 'https://api.goldsky.com/api/public/project_cm1hfr4527p0f01u85mz499u8/subgraphs/sonic_analytics/latest/gn',
};

const affiliateQuery = `
  query Affiliates {
    symmioEntities(where: { type: "Affiliate" }) {
      id
      address
      name
      type
    }
  }
`;

const dailyByDayAndAccounts = `
  query ($day: String!, $accounts: [Bytes!]) {
    dailyHistories(where: { day: $day, accountSource_in: $accounts }) {
      platformFee
      symmioShare
      tradeVolume
      accountSource
      openInterest
    }
  }
`;

export const fetchBuilderSymmioPerps = (builderAddresses: string[]): Fetch => {
  return async (timestamp: number, _c: any, { chain }: { chain: Chain }) => {
    const endpoint = config[chain];
    if (!endpoint || !builderAddresses?.length) return { timestamp };

    const startOfDay = getTimestampAtStartOfDayUTC(timestamp);
    const day = String(Math.floor(startOfDay / 86400));
    const accounts = [...new Set(builderAddresses.map((a) => a.toLowerCase()))];

    let dailyVolume = 0;
    let dailyFees = 0;
    let dailyRevenue = 0;
    let openInterestAtEnd = 0;

    const { dailyHistories }: { dailyHistories: DailyHistory[] } =
      await request(endpoint, dailyByDayAndAccounts, { day, accounts });

    dailyHistories.forEach(({ platformFee, symmioShare, tradeVolume, openInterest }) => {
      const fee = Number(platformFee) / 1e18;
      const share = Number(symmioShare) / 1e18;
      const volume = Number(tradeVolume) / 1e18;
      const oi = Number(openInterest) / 1e18;

      dailyVolume += volume;
      dailyFees += fee;
      dailyRevenue += share;
      openInterestAtEnd += oi;
    })

    return {
      timestamp: startOfDay,
      dailyVolume: dailyVolume.toString(),
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      openInterestAtEnd: openInterestAtEnd.toString(),
    };
  };
};

export const fetchBuilderSymmioPerpsByName = (affiliateName: string): Fetch => {
  return async (timestamp: number, _c: any, { chain }) => {
    const endpoint = config[chain];
    if (!endpoint || !affiliateName) return { timestamp };

    const res = await request(endpoint, affiliateQuery) as { symmioEntities: SymmioEntity[] };
    const wanted = affiliateName.trim().toLowerCase();

    const addresses = res.symmioEntities
      .filter(e => e.type === "Affiliate" && e.name?.trim().toLowerCase() === wanted)
      .map(e => e.address)
      .filter(Boolean);

    if (!addresses.length) return { timestamp: getTimestampAtStartOfDayUTC(timestamp) };

    return fetchBuilderSymmioPerps(addresses)(timestamp, _c, { chain } as any);
  };
};

export const symmioAffiliateAdapter = (affiliateName: string, chains: Chain[] = Object.keys(config) as Chain[], doublecounted = true): Adapter => ({
  version: 1,
  doublecounted,
  methodology: BUILDER_METHODOLOGY,
  adapter: Object.fromEntries(
    chains.map((c) => [c, { fetch: fetchBuilderSymmioPerpsByName(affiliateName)}])
  ),
});