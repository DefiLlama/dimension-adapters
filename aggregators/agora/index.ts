import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Agora (https://www.agoradex.app, https://x.com/agora_elysium): a DEX aggregator on Elysium that routes each trade to
// the best price across the chain's launchpads and DEXs. Every trade made through Agora goes through AgoraRouter,
// which emits Swapped once per trade.
// AgoraRouter: https://elysium.kinetiq.xyz/address/0xaf8dec958df2bd664aa661716a8de5fe0417a295
// Deployment (block 167131, 2026-11-01): https://elysium.kinetiq.xyz/tx/0x080e727ff35a815f202de782c54acb464166038a18cc3876e0a46d1099e3de01
const ROUTER = "0xaf8dec958df2bd664aa661716a8de5fe0417a295";
const NATIVE = "0x0000000000000000000000000000000000000000"; // AgoraRouter.NATIVE: HYPE, Elysium's gas token

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
    if (log.tokenIn === NATIVE) dailyVolume.addGasToken(log.amountIn);
    else if (log.tokenOut === NATIVE) dailyVolume.addGasToken(log.amountOut);
    else dailyVolume.add(log.tokenIn, log.amountIn);

    const fee = BigInt(log.fee);
    const ref = BigInt(log.referrerFee);
    const add = (b: typeof dailyFees, amount: bigint, label: string) => (log.feeAsset === NATIVE ? b.addGasToken(amount, label) : b.add(log.feeAsset, amount, label));
    add(dailyFees, fee, METRIC.SWAP_FEES);
    add(dailyRevenue, fee - ref, "Swap fees to Agora");
    if (ref > 0n) add(dailySupplySideRevenue, ref, "Referral payouts");
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Volume of every trade routed through AgoraRouter (its Swapped events), counted on the HYPE side of the trade.",
  Fees: "Agora's fee on each trade, taken by AgoraRouter in HYPE or the traded token (the fee field of Swapped). Fees of the underlying pools are not included.",
  Revenue: "Agora's fees less the share booked to referrers.",
  ProtocolRevenue: "Agora's fees less the share booked to referrers.",
  SupplySideRevenue: "The share of fees booked to the trader's referrer.",
};

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Agora's fee on each trade routed through AgoraRouter." },
  Revenue: { "Swap fees to Agora": "Agora's fees less the referrer share." },
  ProtocolRevenue: { "Swap fees to Agora": "Agora's fees less the referrer share." },
  SupplySideRevenue: { "Referral payouts": "The referrer's share of each fee, claimable from AgoraRouter." },
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
