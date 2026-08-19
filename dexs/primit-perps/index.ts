import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


// Primit on-chain trade log (Avalanche C-Chain).
//
// Every fill Primit brokers — whether matched on its own engine or routed through
// Orderly Network — is emitted as a `TradeRecorded` event by our TradeRecorder
// contract. This adapter walks the day's event range and sums `price * amount`
// (both 1e18 fixed-point) to derive daily USD notional. Fees are taken from the
// event's fee fields rather than a fixed schedule because Primit supports
// account-specific maker/taker rates.
//
// This is the sole DeFiLlama data source for Primit — every fill, whether matched
// on Primit's own engine or routed by Primit through Orderly Network, is captured
// on-chain by the TradeRecorder contract and counted here exactly once. No
// separate broker-level attribution is used, so there is nothing to deduplicate
// against.
const TRADE_RECORDER = "0xC005A9bb11f162329f3EfCCc35F69F9Bb635EeC6";

const abi = {
  TradeRecorded:
    "event TradeRecorded(bytes32 indexed tradeId, address indexed taker, address indexed maker, string symbol, uint8 side, uint256 price, uint256 amount, int256 takerFee, int256 makerFee, bool isClose, uint64 filledAt)",
};

const methodology = {
  Volume:
    "Sum of `price * amount` for every TradeRecorded event emitted by Primit's TradeRecorder contract (0xC005A9bb11f162329f3EfCCc35F69F9Bb635EeC6 on Avalanche C-Chain) during the UTC day, excluding self-trades where taker == maker. Both `price` and `amount` are 1e18 fixed-point, so the product is scaled by 1e36 and normalized down to floating USD before returning. Data is 100% reconstructable on-chain — no dependency on any Primit-operated HTTP endpoint. Every fill matched or routed by Primit is captured by this single TradeRecorder event stream, so there is no separate broker-level attribution to deduplicate against.",
  Fees:"Includes maker and taker fees paid by traders.",
  Revenue: "Part of trading fees retained by the protocol after deducting fees distributed to makers.",
  ProtocolRevenue: "Part of trading fees retained by the protocol after deducting fees distributed to makers.",
  SupplySideRevenue: "Trading Fees paid to Makers"
};

const breakdownMethodology = {
  Fees: {
    "Maker Fees": "Fees paid by makers to the protocol.",
    "Taker Fees": "Fees paid by takers to the protocol.",
  },
  Revenue: {
    "Trading Fees to Protocol": "Part of trading fees retained by the protocol after deducting fees distributed to makers.",
  },
  ProtocolRevenue: {
    "Trading Fees to Protocol": "Part of trading fees retained by the protocol after deducting fees distributed to makers.",
  },
  SupplySideRevenue: {
    "Trading Fees to Makers": "Trading Fees paid to Makers",
  }
}

const SCALE_18 = 10n ** 18n;

const fetch = async (options: FetchOptions) => {
  const logs: any[] = await options.getLogs({
    target: TRADE_RECORDER,
    eventAbi: abi.TradeRecorded,
  });

  // Accumulate as bigint in 1e18 fixed-point USD. price * amount is 1e36
  // fixed-point, so /1e18 keeps it at 1e18.
  let totalWeiUsd: bigint = 0n;
  let totalMakerFeesWeiUsd: bigint = 0n;
  let totalTakerFeesWeiUsd: bigint = 0n;
  let totalFeesDistributedWeiUsd: bigint = 0n;
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

    // Primit emits the actual fee for each fill. Do not derive fees from a
    // nominal rate: maker/taker rates can vary by account and discount.
    const takerFee = BigInt(log.takerFee.toString());
    const makerFee = BigInt(log.makerFee.toString());
    if (takerFee > 0n) totalTakerFeesWeiUsd += takerFee;
    if (makerFee > 0n) totalMakerFeesWeiUsd += makerFee;
    if (makerFee < 0n) totalFeesDistributedWeiUsd -= makerFee;
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
  const makerFees = toUsdFloat(totalMakerFeesWeiUsd);
  const takerFees = toUsdFloat(totalTakerFeesWeiUsd);
  const feesDistributed = toUsdFloat(totalFeesDistributedWeiUsd);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  dailyFees.addUSDValue(makerFees, "Maker Fees")
  dailyFees.addUSDValue(takerFees, "Taker Fees")
  dailyRevenue.addUSDValue(makerFees + takerFees- feesDistributed, "Trading Fees to Protocol")
  dailySupplySideRevenue.addUSDValue(feesDistributed, "Trading Fees to Makers")

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.AVAX],
  start: "2026-07-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
