import { gql, request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const BUYBACK_BURN_START = "2026-05-18";
const COMMUNITY_VAULT = "0x95e325a85b9e6cb4dea2ccd96218e5f8365e0b0f";
const FEE_DENOMINATOR = 1000;
const ALGEBRA_LICENCE = "Algebra licence fee";

const endpoints: Record<string, string> = {
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v4/latest/gn",
};

// Community fee is per pool (thousandths of the swap fee, sent to the vault).
// algebraFee is the vault's cut of that community fee, also in thousandths, paid to Algebra.
const splitCommunityFees = async (options: FetchOptions, dayTimestamp: number, totalFeesUsd: number) => {
  const algebraFee = Number(await options.api.call({
    target: COMMUNITY_VAULT,
    abi: "function algebraFee() view returns (uint16)",
  }));
  if (!Number.isInteger(algebraFee) || algebraFee < 0 || algebraFee > FEE_DENOMINATOR) {
    throw new Error(`sparkdex-v4: algebraFee ${algebraFee} is outside 0..${FEE_DENOMINATOR}`);
  }

  const poolQuery = gql`
    query {
      poolDayDatas(first: 1000, where: { date: ${dayTimestamp}, feesUSD_gt: "0" }) {
        feesUSD
        pool { communityFee communityVault }
      }
    }
  `;
  const poolRes = await request(endpoints[options.chain], poolQuery);
  const rows: Array<{ feesUSD: string, pool: { communityFee: string, communityVault: string } }> = poolRes.poolDayDatas ?? [];
  if (rows.length >= 1000) throw new Error("sparkdex-v4: more than 999 pools with fees in one day");

  let holdersUsd = 0;
  let algebraUsd = 0;
  let lpUsd = 0;
  let summed = 0;
  for (const row of rows) {
    const fees = Number(row.feesUSD);
    const communityFee = Number(row.pool.communityFee);
    if (!Number.isFinite(fees) || fees < 0) throw new Error("sparkdex-v4: bad pool feesUSD");
    if (!Number.isInteger(communityFee) || communityFee < 0 || communityFee > FEE_DENOMINATOR) {
      throw new Error(`sparkdex-v4: communityFee ${row.pool.communityFee} is outside 0..${FEE_DENOMINATOR}`);
    }
    if (communityFee > 0 && row.pool.communityVault.toLowerCase() !== COMMUNITY_VAULT) {
      throw new Error(`sparkdex-v4: pool vault ${row.pool.communityVault} is not the Algebra community vault`);
    }
    const communityUsd = fees * communityFee / FEE_DENOMINATOR;
    const algebraPart = communityUsd * algebraFee / FEE_DENOMINATOR;
    holdersUsd += communityUsd - algebraPart;
    algebraUsd += algebraPart;
    lpUsd += fees - communityUsd;
    summed += fees;
  }

  if (Math.abs(summed - totalFeesUsd) > 0.05) {
    throw new Error(`sparkdex-v4: pool fees ${summed} disagree with algebraDayData ${totalFeesUsd}`);
  }
  return { holdersUsd, algebraUsd, lpUsd };
};

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.startTimestamp);
  const dateId = Math.floor(todaysTimestamp / 86400);

  const graphQuery = gql`
    query {
      algebraDayData(id: ${dateId}) {
        id
        feesUSD
      }
    }
  `;

  const graphRes = await request(endpoints[options.chain], graphQuery);
  const feesUsd = Number(graphRes.algebraDayData?.feesUSD ?? 0);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesUsd, METRIC.SWAP_FEES);

  const dailyUserFees = dailyFees.clone(1, METRIC.SWAP_FEES);
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  let dailySupplySideRevenue;

  if (options.dateString >= BUYBACK_BURN_START) {
    const split = await splitCommunityFees(options, todaysTimestamp, feesUsd);
    dailySupplySideRevenue = options.createBalances();
    dailySupplySideRevenue.addUSDValue(split.lpUsd, METRIC.LP_FEES);
    dailySupplySideRevenue.addUSDValue(split.algebraUsd, ALGEBRA_LICENCE);
    dailyHoldersRevenue.addUSDValue(split.holdersUsd, METRIC.TOKEN_BUY_BACK);
  } else {
    // Historical: 75% LP / 5% Foundation / 10% BBB / 10% staking
    dailySupplySideRevenue = dailyFees.clone(0.75, METRIC.LP_FEES);
    dailyProtocolRevenue.addUSDValue(feesUsd * 0.05, METRIC.SWAP_FEES);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.1, METRIC.TOKEN_BUY_BACK);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.1, METRIC.STAKING_REWARDS);
  }

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.FLARE],
  start: "2026-01-26",
  methodology: {
    Fees: "Swap fees paid by platform users on SparkDEX V4.",
    UserFees: "100% of collected fees.",
    Revenue: "From 2026-05-18, the community receiver's share of swap fees after Algebra's licence fee. Before that date, 25% of swap fees.",
    ProtocolRevenue: "Before 2026-05-18: 5% of swap fees. From 2026-05-18: none. Algebra's licence fee is not SparkDEX protocol revenue.",
    SupplySideRevenue: "From 2026-05-18, swap fees left in the pool for LPs, plus Algebra's licence fee taken from the community vault. Before that date, 75% of swap fees.",
    HoldersRevenue:
      "Before 2026-05-18: 10% buyback-and-burn plus 10% staking rewards. From 2026-05-18: the community receiver's share of each pool's community fee, after Algebra's vault cut, used by the treasury for SPRK buyback-and-burn.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "All swap fees paid by platform users.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "100% of collected fees.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "5% of swap fees (before 2026-05-18 only).",
      [METRIC.TOKEN_BUY_BACK]: "10% of swap fees before 2026-05-18. From 2026-05-18, each pool's community fee after Algebra's licence fee.",
      [METRIC.STAKING_REWARDS]: "10% of swap fees (before 2026-05-18 only).",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "10% of swap fees before 2026-05-18. From 2026-05-18, each pool's community fee after Algebra's licence fee, used for SPRK buyback-and-burn.",
      [METRIC.STAKING_REWARDS]: "10% of swap fees (before 2026-05-18 only).",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Swap fees left in the pool after the community fee. 75% before 2026-05-18, and each pool's own remainder from that date.",
      [ALGEBRA_LICENCE]: "Algebra's share of the community vault, read from algebraFee (thousandths). Counted from 2026-05-18.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "5% of swap fees (before 2026-05-18 only).",
    },
  },
};

export default adapter;
