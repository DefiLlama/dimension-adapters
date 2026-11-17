import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { pageToncenterTxs, toBigInt } from "../../helpers/ton";
import { chains } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";

/**
 * GroypFi — DEX Aggregator on TON
 *
 * GroypFi aggregates liquidity across DeDust, STON.fi, Tonco, and Bidask
 * for optimal swap routing on the TON blockchain.
 *
 * Volume sources:
 *   - Swap Widget (web app)
 *   - Terminal Quick Buy (web app)
 *   - Launchpad token trading (web app)
 *   - @groypfi_bot (Telegram trading bot)
 *
 * Volume uses the existing 1% estimate on labeled trading fees only.
 * Uranus partner fee claims are included in fees and revenue, not inferred volume.
 *
 * Fee wallet (user-friendly): UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
 * Fee wallet (raw):           0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594
 *
 * Website: https://groypfi.io
 */

const FEE_RECIPIENT = "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594";
const FEE_COMMENTS = new Set(["GroypFi Fee", "Gbot Fee", "GroypFi Bot Fee"]);
const OTHER_FEE_COMMENTS = new Set(["Gifted Fees", "Gifted Marketplace Fees", "walletless fee"]);
// Uranus ClaimPartnerFee: https://github.com/ton-blockchain/abis/blob/master/data/dedust/uranus/meme/types/dedust_uranus_meme_v3.types.tolk
const CLAIM_PARTNER_FEE = "0x7f4bcbf4";
// Uranus callback: https://github.com/ton-blockchain/abis/blob/master/data/dedust/uranus/meme/types/dedust_uranus_meme_v3.types.tolk
const URANUS_PAYOUT = "0x66c8ad72";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const start = options.startTimestamp;
  const end = options.endTimestamp;

  let total = 0n;
  let otherFees = 0n;

  // deduped by hash and restricted to [start, end) by the helper
  const txs = await pageToncenterTxs({ account: FEE_RECIPIENT, startTimestamp: start, endTimestamp: end });
  const traceCache = new Map<string, any[]>();
  const unresolvedPayouts: any[] = [];
  for (const tx of txs) {
    if (tx.description?.action?.success === false) continue;

    const inMsg = tx.in_msg;
    if (!inMsg || inMsg.bounced) continue;
    if (inMsg.destination?.toLowerCase() !== FEE_RECIPIENT.toLowerCase()) continue;
    const comment = inMsg.message_content?.decoded?.comment;
    if (FEE_COMMENTS.has(comment)) {
      total += toBigInt(inMsg.value);
    } else if (OTHER_FEE_COMMENTS.has(comment) || comment?.startsWith("walletless fee ")) {
      otherFees += toBigInt(inMsg.value);
    } else if (inMsg.opcode === URANUS_PAYOUT) {
      // The callback opcode is shared with other operations, including creator claims.
      // Match the actual sender in the full trace; the window may omit related requests.
      if (!tx.trace_id) throw new Error("Missing Uranus payout trace ID");
      unresolvedPayouts.push(tx);
    }
  }

  await PromisePool.for([...new Set<string>(unresolvedPayouts.map(tx => tx.trace_id))])
    .withConcurrency(1) // Preserve sequential requests to avoid Toncenter rate limits.
    .handleError(error => { throw error; })
    .process(async traceId => {
      const response = await chains.ton.toncenterGet({ path: "traces", params: { trace_id: traceId } });
      const trace = response.traces?.[0];
      if (!trace || trace.is_incomplete || trace.trace_info?.trace_state !== "complete")
        throw new Error(`Incomplete Uranus payout trace: ${traceId}`);
      traceCache.set(traceId, Object.values(trace.transactions ?? {}));
    });
  for (const tx of unresolvedPayouts) {
    const sender = traceCache.get(tx.trace_id)!.find(t =>
      t.out_msgs?.some((m: any) => m.hash === tx.in_msg.hash));
    if (!sender) throw new Error(`Missing Uranus payout sender: ${tx.hash}`);
    if (sender.in_msg?.opcode === CLAIM_PARTNER_FEE) otherFees += toBigInt(tx.in_msg.value);
  }

  dailyFees.addGasToken(total.toString());
  const dailyVolume = dailyFees.clone(100);
  dailyFees.addGasToken(otherFees.toString());

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "DEX aggregation volume estimated from labeled GroypFi trading fees using the existing 1% assumption, excluding Uranus partner fee claims.",
  Fees: "Labeled GroypFi trading, Gifted marketplace and walletless fees, plus claimed Uranus partner fees, excluding creator fee claims and gas refunds.",
  Revenue: "Labeled GroypFi trading, Gifted marketplace and walletless fees, plus claimed Uranus partner fees received by the protocol, excluding creator fee claims and gas refunds.",
  ProtocolRevenue: "Labeled GroypFi trading, Gifted marketplace and walletless fees, plus claimed Uranus partner fees received by the protocol, excluding creator fee claims and gas refunds.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-01-04",
  methodology,
  breakdownMethodology: {
    Fees: "GroypFi trading fees, Gifted and walletless fees, and Uranus partner-fee claims are combined in one unlabeled TON balance.",
    Revenue: "GroypFi trading fees, Gifted and walletless fees, and Uranus partner-fee claims are combined in one unlabeled TON balance.",
    ProtocolRevenue: "GroypFi trading fees, Gifted and walletless fees, and Uranus partner-fee claims are combined in one unlabeled TON balance.",
  },
  pullHourly: true,
};

export default adapter;
