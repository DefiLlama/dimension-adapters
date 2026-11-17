import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { nearView } from "../../helpers/near";
import { httpGet } from "../../utils/fetchURL";

// 24h total in USD from Rhea's API, no date params. lst_fee is only the protocol commission on rNEAR
// staking rewards: lst.rhealab.near mints get_beneficiaries() bps of every epoch's rewards to the Rhea DAO
// (ref-finance.sputnik-dao.near, 500 bps), the rest accrues to rNEAR holders through the share price.
const api_fee = "https://api.ref.finance/get-total-fee"
const RNEAR = "lst.rhealab.near"

const fetch = async (options: FetchOptions) => {
  const fee_result = await httpGet(api_fee);
  const rawCommission = fee_result?.fee_data?.lst_fee;
  // Number() turns null, "", " " and false into 0, so only accept numbers and nonblank strings.
  // rewards accrue every epoch (~7h, 3-4 a day), so a 24h commission of 0 is a bad response, not a quiet day
  const isNumeric = (v: any) => typeof v === "number" || (typeof v === "string" && v.trim() !== "");
  const commission = Number(rawCommission);
  if (!isNumeric(rawCommission) || !Number.isFinite(commission) || commission <= 0)
    throw new Error(`rhea-lst: unexpected API response ${JSON.stringify(fee_result)}`);

  const beneficiaries: Record<string, number> = await nearView(RNEAR, "get_beneficiaries");
  const bps = Object.values(beneficiaries).reduce((sum, v) => sum + Number(v), 0);
  if (!(bps > 0 && bps < 10000))
    throw new Error(`rhea-lst: unexpected beneficiaries ${JSON.stringify(beneficiaries)}`);
  const grossRewards = commission * 10000 / bps;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addUSDValue(grossRewards, METRIC.STAKING_REWARDS);
  dailyRevenue.addUSDValue(commission, "Staking rewards to Rhea DAO");
  dailySupplySideRevenue.addUSDValue(grossRewards - commission, "Staking rewards to rNEAR holders");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.NEAR],
  start: '2026-01-12',
  runAtCurrTime: true,
  methodology: {
    Fees: "NEAR staking rewards accrued to the rNEAR pool (net of validator commission), derived from the protocol commission reported by Rhea's API and the commission share set in get_beneficiaries on lst.rhealab.near.",
    Revenue: "The protocol commission on staking rewards (the bps set in get_beneficiaries), minted as rNEAR to the Rhea DAO.",
    ProtocolRevenue: "The protocol commission on staking rewards, paid to the Rhea DAO.",
    SupplySideRevenue: "Staking rewards accrued to rNEAR holders through the rNEAR price, after the protocol commission.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "NEAR staking rewards accrued to the rNEAR pool, net of validator commission.",
    },
    Revenue: {
      "Staking rewards to Rhea DAO": "The protocol commission (the bps set in get_beneficiaries) on staking rewards, minted as rNEAR to the Rhea DAO.",
    },
    ProtocolRevenue: {
      "Staking rewards to Rhea DAO": "The protocol commission (the bps set in get_beneficiaries) on staking rewards, minted as rNEAR to the Rhea DAO.",
    },
    SupplySideRevenue: {
      "Staking rewards to rNEAR holders": "Staking rewards accrued to rNEAR holders through the rNEAR price, after the protocol commission.",
    },
  },
};

export default adapter;
