/*
Cooler Loans Fees Adapter

Cooler Loans is Olympus DAO's native lending protocol.
Borrowers deposit gOHM as collateral to borrow stablecoins at a fixed APR.

Two versions:
  V1 (Clearinghouse, July 2023 – deprecated):
    - Per-user Cooler contracts created by CoolerFactory
    - Three Clearinghouse versions acted as lenders (V1.0, V1.1, V1.2)
    - Fixed-rate 0.5% APR, 121-day terms
    - ~$5.7M in outstanding loans as of 2026-03-10 (winding down)
    - Interest is pre-committed at loan origination; realised on repayment
    - V1 interest is immaterial (~$78/day) and not tracked here

  V2 (MonoCooler, Jan 2025 – active):
    - Single shared contract for all borrowers
    - Dynamic LTV via oracle, perpetual terms
    - ~0.499% APR as of 2026-03-10, ~$119M outstanding
    - Interest tracked via interestAccumulatorRay delta × avgDebt

Methodology:
  Daily fees = avgDebt × (accAfter − accBefore) / 1e27
  Where:
    - avgDebt = (totalDebt at start of day + totalDebt at end of day) / 2
    - accAfter / accBefore = interestAccumulatorRay at end/start of the period
    - This is the continuous-compounding accumulator; delta captures all
      interest accrued in the period regardless of any borrows/repayments

All fees flow to the Olympus DAO treasury (protocol revenue = total fees).

Key contracts:
  MonoCooler (V2): 0xdb591Ea2e5Db886dA872654D58f6cc584b68e7cC
  Verified 2026-03-10: totalDebt=$119.2M USDS, interestRate=0.499% APR
*/

import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const MONO_COOLER = "0xdb591Ea2e5Db886dA872654D58f6cc584b68e7cC";
const USDS = "0xdC035D45d973E3EC169d2276DDab16f1e407384F";

const RAY = BigInt(10) ** BigInt(27);

const ABIS = {
  interestAccumulatorRay: "function interestAccumulatorRay() view returns (uint256)",
  totalDebt: "function totalDebt() view returns (uint256)",
};

/**
 * Fetch daily Cooler Loan interest from the MonoCooler V2 contract.
 *
 * Uses the continuous-compounding interestAccumulatorRay to compute interest
 * accrued in the period: interest = avgDebt × (accAfter − accBefore) / RAY
 *
 * This captures all interest regardless of borrows/repayments mid-period.
 * All interest is protocol revenue — it flows to the Olympus DAO treasury.
 */
async function fetch(options: FetchOptions) {
  const { fromApi, toApi, createBalances } = options;
  const dailyFees = createBalances();

  const [accBefore, accAfter, debtBefore, debtAfter] = await Promise.all([
    fromApi.call({ abi: ABIS.interestAccumulatorRay, target: MONO_COOLER }),
    toApi.call({ abi: ABIS.interestAccumulatorRay, target: MONO_COOLER }),
    fromApi.call({ abi: ABIS.totalDebt, target: MONO_COOLER }),
    toApi.call({ abi: ABIS.totalDebt, target: MONO_COOLER }),
  ]);

  const accDelta = BigInt(accAfter) - BigInt(accBefore);
  const avgDebt = (BigInt(debtBefore) + BigInt(debtAfter)) / BigInt(2);

  if (avgDebt > BigInt(0) && accDelta > BigInt(0)) {
    const interest = (avgDebt * accDelta) / RAY;
    dailyFees.add(USDS, interest);
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const methodology = {
  Fees: "Interest accrued on gOHM-backed loans in the MonoCooler (V2) contract. Calculated as avgDebt × interestAccumulatorRay delta over the period.",
  Revenue: "100% of Cooler Loan interest flows to the Olympus DAO treasury as protocol revenue.",
  ProtocolRevenue: "All interest is protocol revenue — there is no borrower rebate or LP share. Revenue strengthens OHM treasury backing.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-05-07",
  methodology,
};

export default adapter;
