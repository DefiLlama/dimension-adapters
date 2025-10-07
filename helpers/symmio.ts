import request from "graphql-request";
import { Chain, FetchOptions, SimpleAdapter } from "../adapters/types";
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

export const fetchBuilderSymmioPerps = async ({ options, builder_addresses }: { options: FetchOptions; builder_addresses: string[] }) => {
  const endpoint = config[options.chain];
  if (!endpoint || !builder_addresses?.length) return {};

  const day = String(Math.floor(options.startOfDay / 86400));
  const accounts = [...new Set(builder_addresses.map(a => a.toLowerCase()))];

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const openInterestAtEnd = options.createBalances();

  const { dailyHistories }: { dailyHistories: DailyHistory[] } =
    await request(endpoint, dailyByDayAndAccounts, { day, accounts });

  for (const { platformFee, symmioShare, tradeVolume, openInterest } of dailyHistories) {
    const fee = +platformFee / 1e18
    const share = +symmioShare / 1e18
    const volume = +tradeVolume / 1e18
    const oi = +openInterest / 1e18
    const revenue = fee - share;

    dailyVolume.addUSDValue(volume);
    dailyFees.addUSDValue(fee);
    dailyRevenue.addUSDValue(revenue);
    dailyProtocolRevenue.addUSDValue(revenue);
    openInterestAtEnd.addUSDValue(oi);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, openInterestAtEnd };
};

export const fetchBuilderSymmioPerpsByName = async ({ options, affiliateName }: { options: FetchOptions; affiliateName: string }) => {
  const endpoint = config[options.chain];
  if (!endpoint || !affiliateName) return {};

  const res = await request(endpoint, affiliateQuery) as { symmioEntities: SymmioEntity[] };
  const wanted = affiliateName.trim().toLowerCase();

  const addresses = res.symmioEntities
    .filter(e => e.type === "Affiliate" && e.name?.trim().toLowerCase() === wanted)
    .map(e => e.address)
    .filter(Boolean);

  if (!addresses.length) return {};

  return fetchBuilderSymmioPerps({ options, builder_addresses: addresses });
};

export const symmioAffiliateAdapter = (affiliateName: string, chains: Chain[] = Object.keys(config), doublecounted = true): SimpleAdapter => ({
  version: 2,
  chains,
  doublecounted,
  methodology: BUILDER_METHODOLOGY,
  fetch: (options: FetchOptions) => fetchBuilderSymmioPerpsByName({ options, affiliateName }),
});