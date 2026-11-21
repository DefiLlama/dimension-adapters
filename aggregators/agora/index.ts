import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

// Agora (https://www.agoradex.app, https://x.com/agora_elysium): a DEX aggregator on Elysium that routes each trade to
// the best price across the chain's launchpads and DEXs. Every trade made through Agora goes through AgoraRouter,
// which emits Swapped once per trade.
// AgoraRouter: https://elysium.kinetiq.xyz/address/0xaf8dec958df2bd664aa661716a8de5fe0417a295
// Deployment (block 167131, 2026-11-01): https://elysium.kinetiq.xyz/tx/0x080e727ff35a815f202de782c54acb464166038a18cc3876e0a46d1099e3de01
const ROUTER = "0xaf8dec958df2bd664aa661716a8de5fe0417a295";
const NATIVE = ADDRESSES.null; // AgoraRouter.NATIVE: HYPE, Elysium's gas token

// amountIn is what was spent (input less any refund); fee is Agora's fee in feeAsset, of which referrerFee is booked
// to the trader's referrer (claimable from the router).
const swappedEvent =
  "event Swapped(address indexed trader, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address target, address feeAsset, uint256 fee, address referrer, uint256 referrerFee)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({ target: ROUTER, eventAbi: swappedEvent });
  for (const log of logs) {
    // Nearly every trade is a launchpad coin against HYPE: count the HYPE side, which is always priced; otherwise the input.
    if (log.tokenOut === NATIVE) dailyVolume.add(log.tokenOut, log.amountOut);
    else dailyVolume.add(log.tokenIn, log.amountIn);

    const fee = BigInt(log.fee);
    const ref = BigInt(log.referrerFee);
    dailyFees.add(log.feeAsset, fee, METRIC.SWAP_FEES);
    // The referrer's share is a supply-side cost (fees/AGENTS.md: "integrator/referrer fees - these are supply side
    // costs"), so fees = revenue + supply-side revenue.
    dailyRevenue.add(log.feeAsset, fee - ref, "Swap fees to Agora");
    if (ref > 0n) dailySupplySideRevenue.add(log.feeAsset, ref, "Referral fees");
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Volume of every trade routed through AgoraRouter (its Swapped events), counted on the HYPE side of the trade.",
  Fees: "Agora's fee on each trade, taken by AgoraRouter in HYPE or the traded token (the fee field of Swapped). Fees of the underlying pools are not included.",
  Revenue: "Agora's fees less the share booked to referrers (a referral cost, claimable by referrers from AgoraRouter).",
  ProtocolRevenue: "Agora's fees less the share booked to referrers (a referral cost, claimable by referrers from AgoraRouter).",
  SupplySideRevenue: "The share of each fee booked to the trader's referrer, claimable from AgoraRouter.",
};

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Agora's fee on each trade routed through AgoraRouter." },
  Revenue: { "Swap fees to Agora": "Agora's fees less the referrer share." },
  ProtocolRevenue: { "Swap fees to Agora": "Agora's fees less the referrer share." },
  SupplySideRevenue: { "Referral fees": "The referrer's share of each fee, claimable from AgoraRouter." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
