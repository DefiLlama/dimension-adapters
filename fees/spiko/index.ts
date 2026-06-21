// https://docs.spiko.xyz/spiko-mmfs/fees
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { METRIC } from "../../helpers/metrics";

const ORACLE_PRICE_ABI =
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)";
const MANAGEMENT_FEE_RATE = 0.25 / 100;
const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const ORACLE_DECIMALS = 6;
const TOKEN_DECIMALS = 5;

// NAV per share is identical across chains for a given fund, but Spiko's per-chain
// oracles drift out of sync — the Ethereum feeds froze in Jan 2025 and Etherlink lags
// by weeks — so NAV is always read from the canonical, live Polygon oracle for every chain.
const NAV_CHAIN = CHAIN.POLYGON;

type Fund = { asset: string; oracle: string };

// Polygon oracle addresses (canonical NAV source) and the coingecko id of each fund's
// quote currency. USTBL/SPKCC are USD-denominated, EUTBL/eurSPKCC are EUR-denominated.
// UKTBL is intentionally omitted: it is GBP-denominated with no reliable USD price source
// and holds ~$1.9M (~0.2% of AUM).
const FUNDS: Record<string, Fund> = {
  USTBL: { asset: "usd-coin", oracle: "0x021289588cd81dC1AC87ea91e91607eEF68303F5" },
  EUTBL: { asset: "euro-coin", oracle: "0x29503f31B73F0734455942Eb888E13acA1588a4e" },
  SPKCC: { asset: "usd-coin", oracle: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59" },
  eurSPKCC: { asset: "euro-coin", oracle: "0x3868D4e336d14D38031cf680329d31e4712e11cC" },
};

// Per-chain token (share) addresses for each fund. Addresses differ per chain.
const TOKENS: Record<string, Record<string, string>> = {
  [CHAIN.ETHEREUM]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59",
    eurSPKCC: "0x3868D4e336d14D38031cf680329d31e4712e11cC",
  },
  [CHAIN.POLYGON]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0x903d5990119bC799423e9C25c56518Ba7DD19474",
    eurSPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
  },
  [CHAIN.ARBITRUM]: {
    USTBL: "0x021289588cd81dC1AC87ea91e91607eEF68303F5",
    EUTBL: "0xCBeb19549054CC0a6257A77736FC78C367216cE7",
    SPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
    eurSPKCC: "0x0e389C83Bc1d16d86412476F6103027555C03265",
  },
  [CHAIN.BASE]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0xf695Df6c0f3bB45918A7A82e83348FC59517734E",
    eurSPKCC: "0x99F70A0e1786402a6796c6B0AA997ef340a5c6da",
  },
  [CHAIN.ETHERLINK]: {
    USTBL: "0xe4880249745eAc5F1eD9d8F7DF844792D560e750",
    EUTBL: "0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80",
    SPKCC: "0x4f33aCf823E6eEb697180d553cE0c710124C8D59",
    eurSPKCC: "0x3868D4e336d14D38031cf680329d31e4712e11cC",
  },
};

// NAV is the same for every chain, so resolve it once per period (keyed by from/to) and
// reuse it across all chain fetches in the same run.
const navCache: Record<string, Promise<Record<string, { before: number; after: number }>>> = {};

async function getNavChanges(options: FetchOptions) {
  const key = `${options.fromTimestamp}-${options.toTimestamp}`;
  if (!navCache[key]) {
    navCache[key] = (async () => {
      const fundKeys = Object.keys(FUNDS);
      const oracles = fundKeys.map((f) => FUNDS[f].oracle);
      const [blockBefore, blockAfter] = await Promise.all([
        getBlock(options.fromTimestamp, NAV_CHAIN, {}),
        getBlock(options.toTimestamp, NAV_CHAIN, {}),
      ]);
      const apiBefore = new sdk.ChainApi({ chain: NAV_CHAIN, block: blockBefore });
      const apiAfter = new sdk.ChainApi({ chain: NAV_CHAIN, block: blockAfter });
      const [before, after] = await Promise.all([
        apiBefore.multiCall({ calls: oracles, abi: ORACLE_PRICE_ABI, permitFailure: true }),
        apiAfter.multiCall({ calls: oracles, abi: ORACLE_PRICE_ABI, permitFailure: true }),
      ]);
      const out: Record<string, { before: number; after: number }> = {};
      fundKeys.forEach((fund, i) => {
        if (!before[i] || !after[i]) return;
        out[fund] = {
          before: Number(before[i].answer) / 10 ** ORACLE_DECIMALS,
          after: Number(after[i].answer) / 10 ** ORACLE_DECIMALS,
        };
      });
      return out;
    })();
  }
  return navCache[key];
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { createBalances, chain, toApi, fromTimestamp, toTimestamp } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const tokenMap = TOKENS[chain];
  const fundKeys = Object.keys(tokenMap);

  const [navChanges, totalSupplies] = await Promise.all([
    getNavChanges(options),
    toApi.multiCall({
      calls: fundKeys.map((f) => tokenMap[f]),
      abi: "erc20:totalSupply",
      permitFailure: true,
    }),
  ]);

  const periodInYears = (toTimestamp - fromTimestamp) / YEAR_IN_SECONDS;

  fundKeys.forEach((fund, index) => {
    const nav = navChanges[fund];
    if (!nav || !totalSupplies[index]) return;

    const supply = Number(totalSupplies[index]) / 10 ** TOKEN_DECIMALS;
    const { asset } = FUNDS[fund];

    // NAV growth distributed to token holders (the fund's gross yield).
    const assetYield = Math.max(0, supply * (nav.after - nav.before));
    dailyFees.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addCGToken(asset, assetYield, METRIC.ASSETS_YIELDS);

    // 0.25% annual management fee, charged on assets under management (supply x NAV).
    const managementFee = supply * nav.after * MANAGEMENT_FEE_RATE * periodInYears;
    dailyFees.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
    dailyRevenue.addCGToken(asset, managementFee, METRIC.MANAGEMENT_FEES);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Positive NAV growth from Spiko fund (USTBL/EUTBL/SPKCC/eurSPKCC) asset yields plus Spiko's 0.25% annual management fee.",
  Revenue: "Spiko management fees, charged at 0.25% annually on assets under management.",
  ProtocolRevenue: "Spiko management fees, charged at 0.25% annually on assets under management.",
  SupplySideRevenue: "Positive NAV growth from Spiko fund asset yields, distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Positive fund NAV growth read from Spiko's canonical on-chain oracle.",
    [METRIC.MANAGEMENT_FEES]: "0.25% annual management fee charged on assets under management.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "0.25% annual management fee charged on assets under management.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "0.25% annual management fee charged on assets under management.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Positive fund NAV growth distributed to token holders.",
  },
};

const adapter: Adapter = {
  methodology,
  breakdownMethodology,
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-05-01' },
    [CHAIN.POLYGON]: { start: '2024-04-20' },
    [CHAIN.ARBITRUM]: { start: '2024-10-25' },
    [CHAIN.BASE]: { start: '2025-02-12' },
    [CHAIN.ETHERLINK]: { start: '2025-02-12' },
  },
};

export default adapter;
