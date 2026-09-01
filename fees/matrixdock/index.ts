import BigNumber from "bignumber.js";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Matrixdock STBT sources:
// STBT FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/treasury-bill-token-stbt/faq
// Matrixdock announcement: STBT custodian fee reduced from 0.35% p.a. to 0.20% p.a.
// Effective 2026-04-28 00:00 UTC+8, i.e. 2026-04-27 16:00 UTC.

// STBT contract address is from the STBT docs. It emits InterestsDistributed for holder rebases.
const STBT = "0x530824da86689c9c17cdc2871ff29b058345b44a";
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const STBT_FEE_SCHEDULE = [
  { fromTimestamp: 0, feeApy: 0.0035 },
  { fromTimestamp: 1777305600, feeApy: 0.002 },
];

const EVENTS = {
  interestsDistributed: "event InterestsDistributed(int256 interest, uint256 newTotalSupply, uint256 interestFromTime, uint256 interestToTime)",
};

const getStbtCustodianFee = (supply: BigNumber, from: number, to: number) =>
  STBT_FEE_SCHEDULE.reduce((fee, { fromTimestamp, feeApy }, i) => {
    const start = Math.max(from, fromTimestamp);
    const end = Math.min(to, STBT_FEE_SCHEDULE[i + 1]?.fromTimestamp ?? to);
    return end <= start ? fee : fee.plus(supply.times(feeApy).times(end - start).div(YEAR_SECONDS));
  }, new BigNumber(0));

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({
    target: STBT,
    eventAbi: EVENTS.interestsDistributed,
    fromBlock: await options.getFromBlock(),
  });

  logs.forEach((log) => {
    const netYield = new BigNumber(log.interest.toString());
    if (!netYield.gt(0)) return;

    const interestFromTime = Number(log.interestFromTime);
    const interestToTime = Number(log.interestToTime);
    if (interestToTime <= interestFromTime) return;

    const newTotalSupply = new BigNumber(log.newTotalSupply.toString());
    const preRebaseSupply = newTotalSupply.minus(netYield);
    if (!preRebaseSupply.gt(0)) return;

    const protocolFee = getStbtCustodianFee(preRebaseSupply, interestFromTime, interestToTime);
    const grossYield = netYield.plus(protocolFee);

    dailyFees.addUSDValue(grossYield.div(1e18).toNumber(), METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addUSDValue(netYield.div(1e18).toNumber(), METRIC.ASSETS_YIELDS);
    dailyRevenue.addUSDValue(protocolFee.div(1e18).toNumber(), METRIC.MANAGEMENT_FEES);
  });

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-01-18",
    },
  },
  methodology: {
    Fees: "Gross STBT asset yield before custodian fees.",
    SupplySideRevenue: "Net STBT interest distributed to holders through InterestsDistributed rebases.",
    Revenue: "STBT custodian fees accounted as protocol revenue.",
    ProtocolRevenue: "STBT custodian fees accounted as protocol revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Gross STBT asset yield before custodian fees. The STBT custodian fee is 0.35% p.a. before 2026-04-28 00:00 UTC+8 and 0.20% p.a. after.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net STBT interest distributed to holders via the InterestsDistributed event.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "STBT custodian fee calculated from pre-rebase STBT supply over each positive rebase period, using the applicable annual rate.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "STBT custodian fee accounted as protocol revenue.",
    },
  },
};

export default adapter;
