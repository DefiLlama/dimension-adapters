import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

// NeoSoul revenue address (Safe) that receives every Credits top-up payment.
// Credits are sold through NeoTrade, the product NeoSoul operates.
// https://bscscan.com/address/0xa83bdeef155cdff1e03df944c1013521044d79fb
const REVENUE_ADDRESS = "0xa83bdeef155cdff1e03df944c1013521044d79fb";

// dailyFees uses a source label; dailyRevenue uses source + destination.
const CREDITS_TOPUP = "Credits Top-ups";
const CREDITS_TOPUP_TO_PROTOCOL = "Credits Top-ups To Protocol";

// Users buy platform Credits with USDT on BNB Chain at a flat 1 USDT = 1,000
// Credits, offered as three fixed top-up tiers:
//   5 USDT   -> 5,000 Credits
//   20 USDT  -> 20,000 Credits
//   100 USDT -> 100,000 Credits
// USDT is the only token accepted for top-ups, so it is the only one counted.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const topUps = await addTokensReceived({
    options,
    target: REVENUE_ADDRESS,
    token: ADDRESSES.bsc.USDT,
  });
  dailyFees.addBalances(topUps, CREDITS_TOPUP);

  // NeoSoul keeps 100% of top-up payments, so revenue equals fees; it is
  // rebuilt here to carry the destination label the revenue dimensions need.
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(topUps, CREDITS_TOPUP_TO_PROTOCOL);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "USDT paid by users to top up platform Credits on NeoTrade, the product NeoSoul operates, at a flat rate of 1 USDT = 1,000 Credits. Counted as USDT transfers into the protocol revenue address on BNB Chain.",
  UserFees: "All fees are paid by users purchasing Credits; there are no other fee sources.",
  Revenue: "100% of Credits top-up payments are protocol revenue.",
  ProtocolRevenue: "NeoSoul retains 100% of Credits top-up payments.",
};

const breakdownMethodology = {
  Fees: {
    [CREDITS_TOPUP]: "USDT paid by users to top up platform Credits on NeoTrade.",
  },
  UserFees: {
    [CREDITS_TOPUP]: "USDT paid by users to top up platform Credits on NeoTrade.",
  },
  Revenue: {
    [CREDITS_TOPUP_TO_PROTOCOL]: "Credits top-up payments retained by NeoSoul; none is passed on to a supply side.",
  },
  ProtocolRevenue: {
    [CREDITS_TOPUP_TO_PROTOCOL]: "Credits top-up payments retained by NeoSoul; none is passed on to a supply side.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  // First Credits top-up received on 2026-08-13.
  start: "2026-08-13",
  methodology,
  breakdownMethodology,
};

export default adapter;
