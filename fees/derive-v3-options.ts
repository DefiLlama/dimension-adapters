import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { deriveBuybacksMethodology, deriveFeesMethodology, getDeriveBuybacks, getDeriveFees } from "../helpers/derive";

const REVENUE_LABEL = "Trading Fees Net Of Rebates";

const fetch = async (options: FetchOptions) => {
  const fees = await getDeriveFees(options, "option");
  const dailyHoldersRevenue = await getDeriveBuybacks(options);
  const dailyProtocolRevenue = fees.dailyRevenue.clone();
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, REVENUE_LABEL);
  return { ...fees, dailyProtocolRevenue, dailyHoldersRevenue };
};

const { methodology, breakdownMethodology } = deriveFeesMethodology("options");

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.DERIVE_V3],
  start: "2026-10-06", // v3 cutover
  // weekly DRV buybacks spend fees from every Derive market, so ProtocolRevenue is negative on buyback days
  allowNegativeValue: true,
  methodology: {
    ...methodology,
    ProtocolRevenue: "Trading fees minus maker rebates, minus the fees spent on DRV buybacks (negative on buyback days).",
    ...deriveBuybacksMethodology.methodology,
  },
  breakdownMethodology: {
    ...breakdownMethodology,
    ProtocolRevenue: { [REVENUE_LABEL]: "Trading fees minus maker rebates, minus the fees spent on DRV buybacks." },
    ...deriveBuybacksMethodology.breakdownMethodology,
  },
};

export default adapter;
