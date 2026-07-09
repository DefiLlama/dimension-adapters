import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/*
 * 0xEquity — rental income (Fees & Revenue) on Base.
 *
 * 0xEquity tokenizes real estate; each property's off-chain rental income is
 * proven on-chain, trust-minimized, in the IncomeAttestationRegistry. A period
 * (calendar month, periodId = YYYYMM) is "fully proven" only when two independent
 * paths agree: a threshold-signed attestation (Path A) AND a Reclaim zkTLS proof
 * of the same bank statement (Path B). On finalize the registry emits
 * `FullyProven(token, periodId, totalMinor)` where totalMinor is the gross rental
 * income for that property/month in USD minor units (cents).
 *
 * We treat that proven rental income as protocol Fees, and — since it accrues to
 * the property-token holders (the suppliers of capital) — as supply-side revenue.
 * The protocol's own management-fee cut is not yet counted here (see methodology).
 */

// IncomeAttestationRegistry (Base mainnet, source-verified). Holds every property's
// proven monthly rental income; emits FullyProven on finalize.
const REGISTRY = "0xa67edcec210147b85b589313b05e04c680fdef02";

const FULLY_PROVEN_EVENT = "event FullyProven(address indexed token, uint256 indexed periodId, uint256 totalMinor)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Each FullyProven log = one property/month of proven gross rental income.
  const logs = await options.getLogs({
    target: REGISTRY,
    eventAbi: FULLY_PROVEN_EVENT,
  });

  for (const log of logs) {
    // totalMinor is USD cents -> USD
    dailyFees.addUSDValue(Number(log.totalMinor) / 100, "Rental Yield");
    dailySupplySideRevenue.addUSDValue(Number(log.totalMinor) / 100, "Rental Yield to Property Holders");
  }

  // Protocol-retained cut (management fee) not yet quantified on-chain -> 0.
  const dailyRevenue = options.createBalances();

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Gross rental income earned by 0xEquity's tokenized real-estate properties, as proven on-chain in the IncomeAttestationRegistry. A month is counted only when it is fully proven by two independent paths (a threshold-signed attestation and a Reclaim zkTLS proof of the same bank statement) that agree on the amount.",
  SupplySideRevenue: "All proven rental income, which is distributed to the property-token holders (the suppliers of capital) as yield.",
  Revenue: "Protocol-retained management fee. Not yet quantified on-chain; reported as 0 until confirmed.",
};

const breakdownMethodology = {
  Fees: {
    "Rental Yield": "Gross rental income earned by 0xEquity's tokenized real-estate properties, as proven on-chain in the IncomeAttestationRegistry. A month is counted only when it is fully proven by two independent paths (a threshold-signed attestation and a Reclaim zkTLS proof of the same bank statement) that agree on the amount.",
  },
  SupplySideRevenue: {
    "Rental Yield to Property Holders": "All proven rental income, which is distributed to the property-token holders (the suppliers of capital) as yield.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-06-18",
  methodology,
  breakdownMethodology,
};

export default adapter;
