import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Primit on-chain trade log (Avalanche C-Chain).
//
// Every fill matched on Primit's own engine is emitted as a `TradeRecorded`
// event by our TradeRecorder contract. This adapter walks the day's event
// range and sums `price * amount` (both 1e18 fixed-point) to derive daily
// USD notional, then applies the protocol's flat 4 bps trading fee to
// report fees and revenue. No off-chain data source — anything DeFiLlama
// shows for Primit is independently reconstructable from AVAX C-Chain
// event logs.
//
// Volume routed through Orderly Network (BTC/ETH/etc) is attributed
// separately by DeFiLlama's factory/orderly.ts under broker_id=primit
// (see PR #8115). The two pair sets are disjoint, so no double-counting.
const TRADE_RECORDER = "0xC005A9bb11f162329f3EfCCc35F69F9Bb635EeC6";

const abi = {
  TradeRecorded:
    "event TradeRecorded(bytes32 indexed tradeId, address indexed taker, address indexed maker, string symbol, uint8 side, uint256 price, uint256 amount, int256 takerFee, int256 makerFee, bool isClose, uint64 filledAt)",
};

const methodology = {
  Volume:
    "Sum of `price * amount` for every TradeRecorded event emitted by Primit's TradeRecorder contract (0xC005A9bb11f162329f3EfCCc35F69F9Bb635EeC6 on Avalanche C-Chain) during the UTC day, excluding self-trades where taker == maker. Both `price` and `amount` are 1e18 fixed-point, so the product is scaled by 1e36 and normalized down to floating USD before returning. Data is 100% reconstructable on-chain — no dependency on any Primit-operated HTTP endpoint. Volume routed through Orderly Network (BTC/ETH/etc via broker_id=primit) is attributed separately by factory/orderly.ts and NOT double-counted here.",
  Fees:
    "Flat 4 bps (0.04%) trading fee applied to daily USD volume matched on Primit's own engine. Computed as `dailyVolume * 4 / 10000` on the same volume figure derived above.",
  Revenue:
    "100% of trading fees collected on Primit-native pairs accrue to the protocol. No LP or affiliate revenue share is applied to this pair set, so Revenue equals Fees.",
  ProtocolRevenue:
    "Same as Revenue. All protocol-native trading fees stay with the protocol.",
};

const SCALE_18 = 10n ** 18n;
const FEE_RATE_BPS = 4n;
const BPS_DENOM = 10_000n;

const fetch = async (options: FetchOptions) => {
  const logs: any[] = await options.getLogs({
    target: TRADE_RECORDER,
    eventAbi: abi.TradeRecorded,
  });

  // Accumulate as bigint in 1e18 fixed-point USD. price * amount is 1e36
  // fixed-point, so /1e18 keeps it at 1e18.
  let totalWeiUsd: bigint = 0n;
  for (const log of logs) {
    // Defense in depth: skip self-trades (backend also filters, but the
    // adapter shouldn't trust off-chain filtering when the reviewer can
    // verify only what's on-chain).
    if (String(log.taker).toLowerCase() === String(log.maker).toLowerCase()) {
      continue;
    }
    const price = BigInt(log.price.toString());
    const amount = BigInt(log.amount.toString());
    totalWeiUsd += (price * amount) / SCALE_18;
  }

  // Convert bigint → float in two parts to avoid Number precision loss.
  // Number can only represent integers exactly up to 2^53 (~9e15); a
  // single-shot `Number(weiUsd) / 1e18` silently rounds once the day's
  // wei-USD sum exceeds that (≈ 0.009 USD in wei-USD terms — i.e. always
  // for any non-trivial day). Split into whole USD (safe up to ~9
  // quadrillion USD/day) plus sub-USD fraction to keep full precision.
  const toUsdFloat = (weiUsd: bigint) =>
    Number(weiUsd / SCALE_18) + Number(weiUsd % SCALE_18) / 1e18;

  const dailyVolume = toUsdFloat(totalWeiUsd);

  // Apply flat 4 bps trading fee to the same wei-USD volume figure.
  // Perform the multiplication in bigint before normalizing to Number to
  // avoid a second precision loss.
  const feesWeiUsd = (totalWeiUsd * FEE_RATE_BPS) / BPS_DENOM;
  const dailyFees = toUsdFloat(feesWeiUsd);
  // 100% of fees are protocol revenue (no LP / affiliate share on
  // Primit-native pairs today).
  const dailyRevenue = dailyFees;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.AVAX],
  start: "2026-07-16",
  methodology,
};

export default adapter;
