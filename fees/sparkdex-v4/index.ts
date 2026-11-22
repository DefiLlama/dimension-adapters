import { gql, request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { ALGEBRA_INTEGRAL_LABELS } from "../../helpers/algebraIntegral";

const BUYBACK_BURN_START = "2026-05-18";
// Algebra community vault shared by every pool: https://flare-explorer.flare.network/address/0x95e325a85b9e6cb4dea2ccd96218e5f8365e0b0f
const COMMUNITY_VAULT = "0x95e325a85b9e6cb4dea2ccd96218e5f8365e0b0f";
// globalState().communityFee and the vault's algebraFee are both in thousandths
const FEE_DENOMINATOR = 1000;

const endpoints: Record<string, string> = {
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v4/latest/gn",
};

const fetch = async (options: FetchOptions) => {
  const { algebraDayData, poolDayDatas } = await request(endpoints[options.chain], gql`
    query {
      algebraDayData(id: ${options.startOfDay / 86400}) { feesUSD }
      poolDayDatas(first: 1000, where: { date: ${options.startOfDay}, feesUSD_gt: "0" }) {
        feesUSD
        pool { id }
      }
    }
  `);
  if (!algebraDayData) throw new Error(`sparkdex-v4: no algebraDayData for ${options.dateString}`);
  const feesUsd = Number(algebraDayData.feesUSD);

  const [states, algebraFee] = await Promise.all([
    options.api.multiCall({
      abi: "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
      calls: poolDayDatas.map((row: any) => row.pool.id),
    }),
    options.api.call({ target: COMMUNITY_VAULT, abi: "function algebraFee() view returns (uint16)" }),
  ]);
  const communityFeesUsd = poolDayDatas.reduce(
    (sum: number, row: any, i: number) => sum + Number(row.feesUSD) * Number(states[i].communityFee) / FEE_DENOMINATOR,
    0,
  );
  const algebraFeesUsd = communityFeesUsd * Number(algebraFee) / FEE_DENOMINATOR;
  const treasuryFeesUsd = communityFeesUsd - algebraFeesUsd;

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesUsd, METRIC.SWAP_FEES);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(feesUsd - communityFeesUsd, METRIC.LP_FEES);
  dailySupplySideRevenue.addUSDValue(algebraFeesUsd, ALGEBRA_INTEGRAL_LABELS.ALGEBRA_FEES);

  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  if (options.dateString >= BUYBACK_BURN_START) {
    dailyHoldersRevenue.addUSDValue(treasuryFeesUsd, METRIC.TOKEN_BUY_BACK);
  } else {
    // 5% foundation / 10% buyback-and-burn / 10% staking of swap fees = 1:2:2 of the treasury share
    dailyProtocolRevenue.addUSDValue(treasuryFeesUsd / 5, METRIC.SWAP_FEES);
    dailyHoldersRevenue.addUSDValue(treasuryFeesUsd * 2 / 5, METRIC.TOKEN_BUY_BACK);
    dailyHoldersRevenue.addUSDValue(treasuryFeesUsd * 2 / 5, METRIC.STAKING_REWARDS);
  }

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
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
    Revenue: "Each pool's community fee (25% of swap fees) minus Algebra's licence fee, which the community vault takes before paying the SparkDEX treasury.",
    ProtocolRevenue: "Before 2026-05-18: one fifth of the treasury's share, to the foundation. From 2026-05-18: none.",
    SupplySideRevenue: "Swap fees left in the pools for LPs, plus Algebra's licence fee taken from the community fee.",
    HoldersRevenue:
      "Before 2026-05-18: two fifths of the treasury's share to SPRK buyback-and-burn and two fifths to staking rewards. From 2026-05-18: all of it to SPRK buyback-and-burn.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "All swap fees paid by platform users.",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "100% of collected fees.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "One fifth of the treasury's share, to the foundation (before 2026-05-18 only).",
      [METRIC.TOKEN_BUY_BACK]: "Treasury's share used for SPRK buyback-and-burn: two fifths before 2026-05-18, all of it from that date.",
      [METRIC.STAKING_REWARDS]: "Two fifths of the treasury's share (before 2026-05-18 only).",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "Treasury's share used for SPRK buyback-and-burn: two fifths before 2026-05-18, all of it from that date.",
      [METRIC.STAKING_REWARDS]: "Two fifths of the treasury's share (before 2026-05-18 only).",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Swap fees left in the pools after each pool's community fee.",
      [ALGEBRA_INTEGRAL_LABELS.ALGEBRA_FEES]: "Algebra's licence fee: the community vault's algebraFee share (6%) of the community fee.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "One fifth of the treasury's share, to the foundation (before 2026-05-18 only).",
    },
  },
};

export default adapter;
