import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Kasseal: a KCC-20 token launchpad on Kaspa L1 (bonding curves as covenant cells). Volume and fees of its bonding
// curves only (graduated tokens trade on Kasseal pools, a separate listing).
//
// Source: Kasseal's indexer, trade-level and answerable for any past window (API docs:
// https://api.kasseal.com/v1/openapi.yaml, GET /metrics/flows). It answers 503 until it has indexed the whole window,
// so an incomplete window throws instead of being stored. Volume is one side of each trade, gross of the 1% fee: a buy
// is the KAS paid including the fee, a sell the KAS the curve paid out before the fee.
//
// Curve fee: 1% of every buy and sell, paid by the trader in KAS, split by the curve contract:
//   half to the token's creator, half to Kasseal. From 2026-12-01 a wallet partner whose wallet sent the trade earns
//   10% (connected) or 30% (in-wallet) of Kasseal's half; the API reports that share apart and Kasseal's part net of it.
const FLOWS = "https://api.kasseal.com/v1/metrics/flows";
const SOMPI = 1e8;

const LABEL = {
  CURVE_FEES: "Bonding Curve Trading Fees",
  TO_KASSEAL: "Bonding Curve Fees To Kasseal",
  TO_CREATORS: "Bonding Curve Fees To Token Creators",
  TO_PARTNERS: "Bonding Curve Fees To Wallet Partners",
};

const fetch = async (options: FetchOptions) => {
  const res = await fetchURL(`${FLOWS}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  const curve = res?.curve;
  if (!curve) throw new Error(`kasseal: no flows for ${options.startTimestamp}-${options.endTimestamp}`);
  const kas = (sompi: string) => Number(sompi) / SOMPI;

  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("kaspa", kas(curve.volumeSompi));

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("kaspa", kas(curve.feeSompi), LABEL.CURVE_FEES);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addCGToken("kaspa", kas(curve.feeToKassealSompi), LABEL.TO_KASSEAL);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addCGToken("kaspa", kas(curve.feeToCreatorsSompi), LABEL.TO_CREATORS);
  dailySupplySideRevenue.addCGToken("kaspa", kas(curve.feeToPartnersSompi), LABEL.TO_PARTNERS);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "KAS traded in buys and sells on Kasseal bonding curves on Kaspa, one side per trade, fees included. Excludes pools after graduation.",
  Fees: "The 1% trading fee users pay in KAS on every buy and sell on Kasseal bonding curves.",
  UserFees: "The 1% trading fee users pay in KAS on every buy and sell on Kasseal bonding curves.",
  Revenue: "Kasseal's half of the 1% bonding-curve trading fee, after the share paid to wallet partners.",
  ProtocolRevenue: "Kasseal's half of the 1% bonding-curve trading fee, after the share paid to wallet partners, sent to the Kasseal company wallet.",
  SupplySideRevenue: "The token creator's half of the 1% bonding-curve trading fee, plus the share of Kasseal's half paid monthly to wallet partners whose wallet sent the trade.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.CURVE_FEES]: "1% of every buy and sell on Kasseal bonding curves, paid by the trader in KAS.",
  },
  UserFees: {
    [LABEL.CURVE_FEES]: "1% of every buy and sell on Kasseal bonding curves, paid by the trader in KAS.",
  },
  Revenue: {
    [LABEL.TO_KASSEAL]: "Half of the bonding-curve fee goes to Kasseal, less the wallet-partner share.",
  },
  ProtocolRevenue: {
    [LABEL.TO_KASSEAL]: "Half of the bonding-curve fee goes to the Kasseal company wallet, less the wallet-partner share.",
  },
  SupplySideRevenue: {
    [LABEL.TO_CREATORS]: "Half of the bonding-curve fee goes to the token's creator, paid by the curve contract.",
    [LABEL.TO_PARTNERS]: "10% (connected wallet) or 30% (in-wallet trade) of Kasseal's half, for trades sent from a partner wallet, paid monthly from 2026-12-01.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.KASPA],
  start: "2026-10-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
