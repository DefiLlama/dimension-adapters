import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

// Sentry (sentry.trading): token launchpad + multi-venue swap frontend
// on Robinhood Chain. Two fee streams, both indexed by the Sentry
// Goldsky subgraph:
//
// 1. App fee: every swap routed through Sentry's fee-router contracts
//    (Uniswap V3, Uniswap V2 pairs, Uniswap v4 hook pools, PancakeSwap
//    V3) takes 1% of the ETH side inside the contract. A configurable
//    slice of that fee is paid on-chain to referrers (ReferralPaid).
// 2. LP fees on Sentry-launched pools: every launch locks its
//    liquidity in a Uniswap V3 1% pool; the factory splits collected
//    LP fees 70% to the token creator / 30% to the Sentry treasury.
const ENDPOINT = "https://api.goldsky.com/api/public/project_cmm7vh5xwsa8m01qmdr7w7u62/subgraphs/sentry-robinhood/1.1.0/gn";

const WETH = ADDRESSES.robinhood.WETH;
const CREATOR_LP_SHARE = 0.7;

const query = gql`
  query SentryFees($routerDayId: ID!, $protocolDayId: ID!) {
    routerDayData(id: $routerDayId) {
      feesWETH
      referralPaidWETH
    }
    protocolDayData(id: $protocolDayId) {
      feesWETH
    }
  }
`;

/** Decimal WETH string -> wei bigint (subgraph amounts are 1e18-scaled
 *  BigDecimals; float math would lose precision past 2^53). */
function toWei(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded);
}

function scaleWei(wei: bigint, factor: number): bigint {
  return (wei * BigInt(Math.round(factor * 1e6))) / 1_000_000n;
}

const fetch = async (options: FetchOptions) => {
  const day = Math.floor(options.startOfDay / 86400);
  const res = await request(ENDPOINT, query, {
    routerDayId: `all-${day}`,
    protocolDayId: `${day}`,
  });

  // its ok to catch errors, as subgraph may not have data for some days and that doesnt mean the data is invalid, if subgraph is broken, it throws error before this line
  const routerFees = toWei(res.routerDayData?.feesWETH ?? "0");
  const referralPaid = toWei(res.routerDayData?.referralPaidWETH ?? "0");
  const lpFees = toWei(res.protocolDayData?.feesWETH ?? "0");
  const creatorShare = scaleWei(lpFees, CREATOR_LP_SHARE);

  const dailyFees = options.createBalances();
  dailyFees.add(WETH, lpFees, METRIC.SWAP_FEES);
  dailyFees.add(WETH, routerFees, "Router Fees");

  // Protocol keeps the app fee (minus the on-chain referral share) and
  // the treasury's 30% of LP fees; creators' 70% is supply side.
  const dailyRevenue = options.createBalances();
  dailyRevenue.add(WETH, routerFees - referralPaid, "Router Fees to Protocol");
  dailyRevenue.add(WETH, lpFees - creatorShare, "Token Swap Fees to Protocol");

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.add(WETH, creatorShare, "Token Swap Fees to Creators");
  dailySupplySideRevenue.add(WETH, referralPaid, "Router Fees to Referrers");

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "1% app fee on the ETH side of every swap routed through Sentry's fee-router contracts (Uniswap V3/V2/v4 and PancakeSwap V3 venues), plus the 1% Uniswap V3 LP fee on Sentry-launched token pools.",
  Revenue: "The app fee minus the on-chain referral share, plus the treasury's 30% split of LP fees on Sentry-launched pools.",
  ProtocolRevenue: "The app fee minus the on-chain referral share, plus the treasury's 30% split of LP fees on Sentry-launched pools.",
  SupplySideRevenue: "Token creators' 70% split of LP fees on their launched pools, plus referral payouts to users.",
};

const breakdownMethodology = {
  Fees: {
    "Router Fees": "1% app fee on the ETH side of every swap routed through Sentry's fee-router contracts (Uniswap V3/V2/v4 and PancakeSwap V3 venues)",
    [METRIC.SWAP_FEES]: "1% Uniswap V3 LP fee on Sentry-launched token pools.",
  },
  Revenue: {
    "Router Fees to Protocol": "1% app fee on the ETH side of every swap routed through Sentry's fee-router contracts (Uniswap V3/V2/v4 and PancakeSwap V3 venues) minus the on-chain referral share",
    "Token Swap Fees to Protocol": "30% of 1% Uniswap V3 LP fee on Sentry-launched token pools",
  },
  ProtocolRevenue: {
    "Router Fees to Protocol": "1% app fee on the ETH side of every swap routed through Sentry's fee-router contracts (Uniswap V3/V2/v4 and PancakeSwap V3 venues) minus the on-chain referral share",
    "Token Swap Fees to Protocol": "30% of 1% Uniswap V3 LP fee on Sentry-launched token pools",
  },
  SupplySideRevenue: {
    "Token Swap Fees to Creators": "Token creators' 70% split of LP fees on their launched pools.",
    "Router Fees to Referrers": "Referral payouts from router fees to users.",
  },
}

const adapter: SimpleAdapter = {
  version: 1, //graph accepts day
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-02",
  methodology,
  doublecounted: true, // uniswap and pancakeswap
  breakdownMethodology,
};

export default adapter;
