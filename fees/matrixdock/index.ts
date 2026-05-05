import BigNumber from "bignumber.js";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Matrixdock STBT sources:
// STBT FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/treasury-bill-token-stbt/faq
// Matrixdock announcement: STBT custodian fee reduced from 0.35% p.a. to 0.20% p.a.
// Effective 2026-04-28 00:00 UTC+8, i.e. 2026-04-27 16:00 UTC.

// STBT contract address is from the STBT docs. It emits InterestsDistributed for holder rebases.
const STBT = "0x530824da86689c9c17cdc2871ff29b058345b44a";
// Deployment/start block supplied from verified contract deployment history.
const STBT_START_BLOCK = 16431887;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const FEE_CHANGE_TIMESTAMP = 1777305600; // 2026-04-28 00:00 UTC+8
const STBT_FEE_SCHEDULE = [
  { fromTimestamp: 0, feeApy: 0.0035 },
  { fromTimestamp: FEE_CHANGE_TIMESTAMP, feeApy: 0.002 },
];

const INTERESTS_DISTRIBUTED_EVENT =
  "event InterestsDistributed(int256 interest, uint256 newTotalSupply, uint256 interestFromTime, uint256 interestToTime)";

const STBT_YIELD = "STBT Yield";
const STBT_YIELD_TO_HOLDERS = "STBT Yield To Holders";
const STBT_CUSTODIAN_FEES = "STBT Custodian Fees";

const toUsd = (amount: BigNumber) => amount.div(1e18).toNumber();

const getFromBlock = async (options: FetchOptions, productStartBlock: number) => {
  return Math.max(await options.getFromBlock(), productStartBlock);
};

const getStbtCustodianFee = (supply: BigNumber, fromTimestamp: number, toTimestamp: number) => {
  let fee = new BigNumber(0);

  for (let i = 0; i < STBT_FEE_SCHEDULE.length; i++) {
    const currentRate = STBT_FEE_SCHEDULE[i];
    const nextRate = STBT_FEE_SCHEDULE[i + 1];
    const periodStart = Math.max(fromTimestamp, currentRate.fromTimestamp);
    const periodEnd = Math.min(toTimestamp, nextRate?.fromTimestamp ?? toTimestamp);

    if (periodEnd <= periodStart) continue;

    fee = fee.plus(
      supply
        .times(currentRate.feeApy)
        .times(periodEnd - periodStart)
        .div(YEAR_SECONDS),
    );
  }

  return fee;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const fromBlock = await getFromBlock(options, STBT_START_BLOCK);
  const logs = await options.getLogs({
    target: STBT,
    eventAbi: INTERESTS_DISTRIBUTED_EVENT,
    fromBlock,
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

    dailyFees.addUSDValue(toUsd(grossYield), STBT_YIELD);
    dailySupplySideRevenue.addUSDValue(toUsd(netYield), STBT_YIELD_TO_HOLDERS);
    dailyRevenue.addUSDValue(toUsd(protocolFee), STBT_CUSTODIAN_FEES);
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
    ProtocolRevenue: "Same as Revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [STBT_YIELD]: "Gross STBT asset yield before custodian fees. The STBT custodian fee is 0.35% p.a. before 2026-04-28 00:00 UTC+8 and 0.20% p.a. after.",
    },
    SupplySideRevenue: {
      [STBT_YIELD_TO_HOLDERS]: "Net STBT interest distributed to holders via the InterestsDistributed event.",
    },
    Revenue: {
      [STBT_CUSTODIAN_FEES]: "STBT custodian fee calculated from pre-rebase STBT supply over each positive rebase period, using the applicable annual rate.",
    },
    ProtocolRevenue: {
      [STBT_CUSTODIAN_FEES]: "STBT custodian fee accounted as protocol revenue.",
    },
  },
};

export default adapter;
