import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import { fetchPolymarketV2BuilderFees } from "../helpers/polymarket";
import fetchURL from "../utils/fetchURL";
import ADDRESSES from "../helpers/coreAssets.json";

// Onagi: trading app with an AI agent on Robinhood Chain (https://onagi.si).
// Its income, pooled together in the treasury and split the same way every hour:
// 1. Token trading fees: every token and stock token trade made in Onagi pays its fee in USDG into one fee vault contract.
// 2. Perps trading fees: Onagi's Lighter integrator fee on perps trades (Lighter on Robinhood Chain), from Lighter's partner stats.
// 3. Prediction market trading fees: Onagi's Polymarket builder fee on prediction trades (Polygon).
// 4. ONAGI token fees: the creator share of Pons V2 fees on ONAGI trades (paired with native ETH),
//    read from the ONAGI curve and its graduated pool, like the hedge-pons adapter.
// Docs: https://onagi.si/docs , live split and payout ledger: https://onagi.si/data/cycles.json
const FEE_VAULT = "0xe2f197bA0D1C0864b86FA36186c0c80B57f54F49";
const USDG = ADDRESSES.robinhood.USDG;

const ONAGI_CURVE = "0xD312Cb6E1bE47BfB71CC33AdBd1233DA6Bc3D246";
const PONS_HOOK = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044";
const ONAGI_POOL_ID = "0x7854e6e94a0d3ad53a35c793e2633ed2bc0d7674e8baeadb6bbe090170a968d4";

const CURVE_FEES_SWEPT = "event FeesSwept(uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount)";
const POOL_FEES_SWEPT = "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)";

// Onagi's Lighter integrator account; the same one dexs/onagi-perps.ts reads volume from.
const LIGHTER_PARTNER_STATS = "https://api.rh.lighter.xyz/api/v1/partnerStats";
const LIGHTER_ACCOUNT_INDEX = 22388;
// Onagi's Polymarket builder code (builder "onagi" in https://data-api.polymarket.com/v2/builders/volume)
const POLYMARKET_BUILDER_CODE = "0x2ce40875d56e3e37d1ec456cedb0d252d611fd7afea48497b6d323729e6a0f7f";

// Onagi's published split of everything it keeps: 50% paid to ONAGI holders in USDG,
// 25% buys ONAGI and burns it, 25% treasury (split.payoutBps / buybackBps / treasuryBps in cycles.json).
const HOLDERS_PAYOUT_BPS = 5000;
const BUYBACK_BURN_BPS = 2500;
const TREASURY_BPS = 2500;
const BPS = 10000;

const LABELS = {
  TOKEN_TRADING_FEES: "Token Trading Fees",
  PERPS_TRADING_FEES: "Perps Trading Fees",
  PREDICTION_TRADING_FEES: "Prediction Market Trading Fees",
  ONAGI_TOKEN_FEES: "ONAGI Token Swap Fees",
  ONAGI_TOKEN_FEES_TO_ONAGI: "ONAGI Token Swap Fees To Onagi",
  ONAGI_TOKEN_FEES_TO_PONS: "ONAGI Token Swap Fees To Pons",
  HOLDER_PAYOUTS: "Holder Payouts",
  BUYBACK_BURN: "Token Buyback And Burn",
  TREASURY: "Treasury",
} as const;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // what Onagi keeps, before the split
  const kept = options.createBalances();

  // all fees Onagi charges and keeps itself (platform fees), one label each
  const addPlatformFees = (fees: ReturnType<typeof options.createBalances>, label: string) => {
    dailyFees.addBalances(fees, label);
    dailyUserFees.addBalances(fees, label);
    dailyRevenue.addBalances(fees, label);
    kept.addBalances(fees);
  };

  if (options.chain === CHAIN.POLYGON) {
    const { dailyFees: builderFees } = await fetchPolymarketV2BuilderFees({ options, builderCode: POLYMARKET_BUILDER_CODE });
    addPlatformFees(builderFees, LABELS.PREDICTION_TRADING_FEES);
  } else {
    const [tokenTradingFees, curveSweeps, poolSweeps, lighterStats] = await Promise.all([
      addTokensReceived({ options, target: FEE_VAULT, token: USDG }),
      options.getLogs({ target: ONAGI_CURVE, eventAbi: CURVE_FEES_SWEPT }),
      options.getLogs({
        target: PONS_HOOK,
        eventAbi: POOL_FEES_SWEPT,
        topics: [id("PoolFeesSwept(bytes32,uint256,uint256,uint256,uint256)"), ONAGI_POOL_ID],
      }),
      fetchURL(`${LIGHTER_PARTNER_STATS}?account_index=${LIGHTER_ACCOUNT_INDEX}&start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`),
    ]);

    addPlatformFees(tokenTradingFees, LABELS.TOKEN_TRADING_FEES);

    const perpsTradingFees = options.createBalances();
    perpsTradingFees.addUSDValue(Number(lighterStats.total_fees_earned));
    addPlatformFees(perpsTradingFees, LABELS.PERPS_TRADING_FEES);

    for (const log of [...curveSweeps, ...poolSweeps]) {
      const pons = BigInt(log.protocolAmount) + BigInt(log.buybackAmount);
      const creator = BigInt(log.creatorAmount);
      dailyFees.addGasToken(pons + creator, LABELS.ONAGI_TOKEN_FEES);
      dailyUserFees.addGasToken(pons + creator, LABELS.ONAGI_TOKEN_FEES);
      dailySupplySideRevenue.addGasToken(pons, LABELS.ONAGI_TOKEN_FEES_TO_PONS);
      dailyRevenue.addGasToken(creator, LABELS.ONAGI_TOKEN_FEES_TO_ONAGI);
      kept.addGasToken(creator);
    }
  }

  const share = (bps: number) => kept.clone(bps / BPS);
  dailyHoldersRevenue.addBalances(share(HOLDERS_PAYOUT_BPS), LABELS.HOLDER_PAYOUTS);
  dailyHoldersRevenue.addBalances(share(BUYBACK_BURN_BPS), LABELS.BUYBACK_BURN);
  dailyProtocolRevenue.addBalances(share(TREASURY_BPS), LABELS.TREASURY);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Platform fees on every trade made in Onagi: USDG fees on token and stock token trades (transfers into the Onagi fee vault), Onagi's Lighter integrator fee on perps trades and its Polymarket builder fee on prediction market trades. Plus all Pons V2 swap fees and creator tax charged on ONAGI token trades (curve and graduated pool sweep events). Token trading fees include a small reimbursement for network gas that Onagi pays on behalf of users, which is not separated on chain.",
  UserFees: "Platform fees on token, stock token, perps and prediction market trades made in Onagi, plus all Pons V2 swap fees and creator tax charged on ONAGI token trades (curve and graduated pool sweep events).",
  Revenue: "Platform fees plus the creator share of ONAGI token swap fees that Pons credits to Onagi.",
  SupplySideRevenue: "The Pons protocol and Pons buyback share of ONAGI token swap fees, not kept by Onagi.",
  HoldersRevenue: "75% of revenue: 50% is paid to eligible ONAGI holders in USDG and 25% buys ONAGI and sends it to the burn address. Computed from Onagi's published split.",
  ProtocolRevenue: "25% of revenue goes to the Onagi treasury.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.TOKEN_TRADING_FEES]: "USDG fees paid into the Onagi fee vault on token and stock token trades, including gas reimbursement.",
    [LABELS.PERPS_TRADING_FEES]: "Onagi's integrator fee on Lighter perps trades routed through Onagi (total_fees_earned in Lighter's partner stats).",
    [LABELS.PREDICTION_TRADING_FEES]: "Onagi's builder fee on Polymarket trades routed through Onagi (builderFee of its attributed CLOB trades).",
    [LABELS.ONAGI_TOKEN_FEES]: "protocolAmount + buybackAmount + creatorAmount from FeesSwept on the ONAGI curve and PoolFeesSwept for the ONAGI pool, in ETH.",
  },
  UserFees: {
    [LABELS.TOKEN_TRADING_FEES]: "Same as Fees.",
    [LABELS.PERPS_TRADING_FEES]: "Same as Fees.",
    [LABELS.PREDICTION_TRADING_FEES]: "Same as Fees.",
    [LABELS.ONAGI_TOKEN_FEES]: "Same as Fees.",
  },
  Revenue: {
    [LABELS.TOKEN_TRADING_FEES]: "All token trading fees.",
    [LABELS.PERPS_TRADING_FEES]: "All perps trading fees.",
    [LABELS.PREDICTION_TRADING_FEES]: "All prediction market trading fees.",
    [LABELS.ONAGI_TOKEN_FEES_TO_ONAGI]: "creatorAmount of each ONAGI sweep, credited to Onagi in the Pons fee escrow.",
  },
  SupplySideRevenue: {
    [LABELS.ONAGI_TOKEN_FEES_TO_PONS]: "protocolAmount + buybackAmount of each ONAGI sweep.",
  },
  HoldersRevenue: {
    [LABELS.HOLDER_PAYOUTS]: "50% of revenue, paid to eligible ONAGI holders in USDG.",
    [LABELS.BUYBACK_BURN]: "25% of revenue, used to buy ONAGI and burn it.",
  },
  ProtocolRevenue: {
    [LABELS.TREASURY]: "25% of revenue, kept by the Onagi treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD, CHAIN.POLYGON],
  start: "2026-10-22",
  methodology,
  breakdownMethodology,
  doublecounted: true, // pons
};

export default adapter;
