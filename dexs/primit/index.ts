import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Primit on-chain trade log (Avalanche C-Chain).
//
// Every fill matched on Primit's own engine is emitted as a `TradeRecorded`
// event by our TradeRecorder contract. This adapter walks the day's event
// range and sums `price * amount` (both 1e18 fixed-point) to derive daily
// USD notional. No off-chain data source — anything DeFiLlama shows for
// Primit is independently reconstructable from AVAX C-Chain event logs.
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
    "Sum of `price * amount` for every TradeRecorded event emitted by Primit's TradeRecorder contract (0xC005A9bb11f162329f3EfCCc35F69F9Bb635EeC6 on Avalanche C-Chain) during the UTC day. Both `price` and `amount` are 1e18 fixed-point, so the product is scaled by 1e36 and normalized down to floating USD before returning. Data is 100% reconstructable on-chain — no dependency on any Primit-operated HTTP endpoint. Volume routed through Orderly Network (BTC/ETH/etc via broker_id=primit) is attributed separately by factory/orderly.ts and NOT double-counted here.",
};

const SCALE_18 = 10n ** 18n;

const fetch: FetchV2 = async (options: FetchOptions) => {
  const logs: any[] = await options.getLogs({
    target: TRADE_RECORDER,
    eventAbi: abi.TradeRecorded,
  });

  // Accumulate as bigint in 1e18 fixed-point USD, then convert once at the
  // end. price * amount is 1e36 fixed-point, so /1e18 keeps it at 1e18.
  // A single trade at $1M notional is 1e6 * 1e18 = 1e24 wei-USD; the daily
  // sum easily fits in a bigint. Final divide to Number is safe because
  // realistic daily USD totals stay below 2^53 / 1e18 (≈ 9e9 USD).
  let totalWeiUsd: bigint = 0n;
  for (const log of logs) {
    const price = BigInt(log.price.toString());
    const amount = BigInt(log.amount.toString());
    totalWeiUsd += (price * amount) / SCALE_18;
  }

  const dailyVolume = Number(totalWeiUsd) / 1e18;

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: "2026-07-16",
      meta: { methodology },
    },
  },
};

export default adapter;
