/**
 * Bubblegum — prediction-market launchpad on Solana.
 * DeFiLlama Dimensions adapter (Fees & Revenue).
 *
 * DATA SOURCE: the protocol indexer's read-only aggregate endpoint
 *   GET https://bgum-mainnet-indexer-production.up.railway.app/defillama/daily?date=YYYY-MM-DD
 * `curveFeesSolLamports` is the native-SOL bonding-curve trade fee (1% of curve
 * volume), summed per UTC day from the on-chain-derived `trades` table.
 *
 * Fee split (curveGlobalConfig: default_curve_fee_bps=100, default_creator_fee_bps=50):
 *   • 50% of the 1% fee → market creator      → SupplySideRevenue
 *   • 50% of the 1% fee → protocol treasury    → Revenue / ProtocolRevenue
 *
 * SCOPE (v1): native-SOL curve fees only. CPMM mint/burn fees are denominated in
 * $TICKER (returned separately as cpmmFeesTickerBase) and are not folded in until
 * a TICKER→SOL conversion is wired. Post-graduation Meteora pool fees belong to
 * Meteora's own adapter.
 */
import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const INDEXER = "https://bgum-mainnet-indexer-production.up.railway.app/defillama/daily";
const SOL = "So11111111111111111111111111111111111111112"; // wSOL mint — priced as SOL

// Protocol keeps `PROTOCOL_BPS` of every `TOTAL_BPS` of curve fee; the rest
// accrues to the market creator (supply side).
const PROTOCOL_BPS = 50n;
const TOTAL_BPS = 100n;

// Breakdown labels — every fee balance is tagged so DeFiLlama can render a
// per-source breakdown that matches `breakdownMethodology` below.
const METRICS = {
  CurveTradeFee: "Bonding-curve trade fee",
  ProtocolShare: "Protocol share",
  CreatorShare: "Creator share",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  // v2: key the day window off dateString (YYYY-MM-DD, UTC), not startOfDay.
  const d = await fetchURL(`${INDEXER}?date=${options.dateString}`);

  const curveFee = BigInt(d.curveFeesSolLamports ?? "0");
  const protocolCut = (curveFee * PROTOCOL_BPS) / TOTAL_BPS;
  const creatorCut = curveFee - protocolCut;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.add(SOL, curveFee.toString(), METRICS.CurveTradeFee);
  dailyRevenue.add(SOL, protocolCut.toString(), METRICS.ProtocolShare);
  dailyProtocolRevenue.add(SOL, protocolCut.toString(), METRICS.ProtocolShare);
  dailySupplySideRevenue.add(SOL, creatorCut.toString(), METRICS.CreatorShare);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // The data source is a per-UTC-day aggregate endpoint (no intraday
  // granularity), so a single daily pull is correct — hourly polling would only
  // re-read the same daily bucket.
  pullHourly: false,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-13", // first mainnet deploy
  methodology: {
    Fees: "Native-SOL bonding-curve trading fees (1% of curve volume), summed per UTC day from the protocol's on-chain-derived trades table.",
    Revenue: "Protocol's share of the curve fee (50% by default; the other 50% accrues to market creators).",
    ProtocolRevenue: "Same as Revenue — the fee retained by the protocol treasury.",
    SupplySideRevenue: "Market creators' share of the curve fee (50% by default).",
  },
  breakdownMethodology: {
    Fees: { [METRICS.CurveTradeFee]: "1% fee charged on every bonding-curve buy/sell, in native SOL." },
    Revenue: { [METRICS.ProtocolShare]: "50% of the curve fee retained by the protocol treasury." },
    ProtocolRevenue: { [METRICS.ProtocolShare]: "50% of the curve fee retained by the protocol treasury." },
    SupplySideRevenue: { [METRICS.CreatorShare]: "50% of the curve fee paid to the market creator." },
  },
};

export default adapter;
