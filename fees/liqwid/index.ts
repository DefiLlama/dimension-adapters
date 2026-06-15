import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const endpoint = "https://v2.api.liqwid.finance/graphql";

const query = gql`
  query Fees($startDate: String!, $endDate: String!) {
    analytics {
      fees(startDate: $startDate, endDate: $endDate) {
        breakdown {
          borrowInterestAccrued
          borrowInterestAccruedForSupplySide
          borrowInterestAccruedForHolders
          borrowInterestAccruedForProtocol
          loanOriginationFees
          loanOriginationFeesForProtocol
          loanOriginationFeesForHolders
          liquidationBonus
          adaStakingRewards
          lqStakingRewards
        }
      }
    }
  }
`;

const ORIGINATION_FEES = "Origination Fees";
const LQ_STAKING_REWARDS = "LQ Staking Rewards";

// The analytics API rejects windows past its ingested-data boundary with an
// error like "... is past the ingested data boundary of ...". Match the
// distinctive "ingested data boundary" phrase rather than the full message, so
// this stays robust to wording changes while still being specific enough that
// unrelated upstream failures propagate as real errors instead of zeroing out.
const isDataNotReadyError = (e: any): boolean => {
  const errors = e?.response?.errors;
  const messages = Array.isArray(errors) && errors.length
    ? errors.map((err: any) => err?.message ?? "")
    : [e?.message ?? ""];
  return messages.some((m: string) => /ingested data boundary/i.test(m));
};

const fetch = async (options: FetchOptions) => {
  const startDate = new Date(options.startTimestamp * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();

  try {
    const data = await request(endpoint, query, { startDate, endDate }, { "X-App-Source": "DefiLlama" });
    const breakdown = data.analytics.fees.breakdown;

    // Note: lqStakingRewards are distributed for 1-week epochs with a ~1 week delay.
    // Once they are reported the whole epoch rewards are added to the day they are distributed,
    // so they will reflect in daily fees at the time of distribution, not proportional to when they are earned.
    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(breakdown.borrowInterestAccrued, METRIC.BORROW_INTEREST);
    dailyFees.addUSDValue(breakdown.loanOriginationFees, ORIGINATION_FEES);
    dailyFees.addUSDValue(breakdown.liquidationBonus, METRIC.LIQUIDATION_FEES);
    dailyFees.addUSDValue(breakdown.adaStakingRewards, METRIC.STAKING_REWARDS);
    dailyFees.addUSDValue(breakdown.lqStakingRewards, LQ_STAKING_REWARDS);

    // ADA and LQ staking rewards are not paid by borrowers, so they are excluded from user fees
    const dailyUserFees = options.createBalances();
    dailyUserFees.addUSDValue(breakdown.borrowInterestAccrued, METRIC.BORROW_INTEREST);
    dailyUserFees.addUSDValue(breakdown.loanOriginationFees, ORIGINATION_FEES);
    dailyUserFees.addUSDValue(breakdown.liquidationBonus, METRIC.LIQUIDATION_FEES);

    const dailySupplySideRevenue = options.createBalances();
    dailySupplySideRevenue.addUSDValue(breakdown.borrowInterestAccruedForSupplySide, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.addUSDValue(breakdown.liquidationBonus, METRIC.LIQUIDATION_FEES);
    dailySupplySideRevenue.addUSDValue(breakdown.adaStakingRewards, METRIC.STAKING_REWARDS);

    const dailyProtocolRevenue = options.createBalances();
    dailyProtocolRevenue.addUSDValue(breakdown.borrowInterestAccruedForProtocol, METRIC.BORROW_INTEREST);
    dailyProtocolRevenue.addUSDValue(breakdown.loanOriginationFeesForProtocol, ORIGINATION_FEES);

    const dailyHoldersRevenue = options.createBalances();
    dailyHoldersRevenue.addUSDValue(breakdown.borrowInterestAccruedForHolders, METRIC.BORROW_INTEREST);
    dailyHoldersRevenue.addUSDValue(breakdown.loanOriginationFeesForHolders, ORIGINATION_FEES);
    dailyHoldersRevenue.addUSDValue(breakdown.lqStakingRewards, LQ_STAKING_REWARDS);

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
  } catch (e) {
    if (isDataNotReadyError(e)) {
      console.error(`[liqwid] analytics data not yet ingested for ${startDate}..${endDate}, returning 0`);
      return {
        dailyFees: options.createBalances(),
        dailyUserFees: options.createBalances(),
        dailyRevenue: options.createBalances(),
        dailyProtocolRevenue: options.createBalances(),
        dailyHoldersRevenue: options.createBalances(),
        dailySupplySideRevenue: options.createBalances(),
      };
    }
    throw e;
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.CARDANO],
  fetch,
  start: "2026-01-01",
  pullHourly: false,
  methodology: {
    Fees: "Total fees generated by the protocol: interest accrued by borrowers, loan origination fees, liquidation bonuses and staking rewards earned on assets held in the markets.",
    SupplySideRevenue: "Portion of fees distributed to lenders supplying assets to the markets.",
    Revenue: "Portion of fees kept by the protocol, split between the Liqwid DAO treasury and LQ stakers.",
    ProtocolRevenue: "Portion of fees allocated to the Liqwid DAO treasury.",
    HoldersRevenue: "Portion of fees distributed to LQ stakers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Interest accrued by borrowers across all Liqwid markets.",
      [ORIGINATION_FEES]: "Upfront fees charged to borrowers when loans are originated.",
      [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses paid by borrowers whose positions are liquidated.",
      [METRIC.STAKING_REWARDS]: "ADA staking rewards earned on ADA supplied to the protocol.",
      [LQ_STAKING_REWARDS]: "LQ staking rewards distributed to LQ stakers.",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "Share of borrow interest distributed to lenders.",
      [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses paid to liquidators.",
      [METRIC.STAKING_REWARDS]: "ADA staking rewards distributed to ADA suppliers.",
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Share of borrow interest kept by the DAO treasury and distributed to LQ stakers.",
      [ORIGINATION_FEES]: "Share of loan origination fees kept by the DAO treasury and distributed to LQ stakers.",
      [LQ_STAKING_REWARDS]: "LQ staking rewards distributed to LQ stakers.",
    },
    ProtocolRevenue: {
      [METRIC.BORROW_INTEREST]: "Share of borrow interest allocated to the Liqwid DAO treasury.",
      [ORIGINATION_FEES]: "Share of loan origination fees allocated to the Liqwid DAO treasury.",
    },
    HoldersRevenue: {
      [METRIC.BORROW_INTEREST]: "Share of borrow interest distributed to LQ stakers.",
      [ORIGINATION_FEES]: "Share of loan origination fees distributed to LQ stakers.",
      [LQ_STAKING_REWARDS]: "LQ staking rewards distributed to LQ stakers.",
    },
  },
};

export default adapter;
