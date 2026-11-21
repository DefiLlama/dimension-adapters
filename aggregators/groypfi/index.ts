import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { pageToncenterTxs, toBigInt, toncenterGet } from "../../helpers/ton";

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
 * Fees are inflows to the house fee wallet, matched by comment or by the request that triggered them:
 *   - labeled swap / Gifted / walletless fee transfers
 *   - DeDust Uranus partner-fee claims (bonding curve)
 *   - DeDust v2 CPMM creator-fee and LP-position-fee claims on graduated Uranus pools: at graduation the
 *     pool is created with the house wallet as creator and LP position owner
 * Everything else (deposits, perps withdrawals, NFT mint proceeds, gas refunds, the house wallet's own trades) is excluded.
 *
 * Volume is estimated from the labeled swap fees at 1%, the highest rate seen on-chain. Discounted trades
 * pay less (web 0.8% / 0.5%, bot 0.1%), so volume is a lower bound.
 *
 * Fee wallet (user-friendly): UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q (groypfihouse.ton)
 * Fee wallet (raw):           0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594
 *
 * Website: https://groypfi.io
 */

const FEE_RECIPIENT = "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594";

const SWAP_FEE_COMMENTS = new Set(["GroypFi Fee", "Gbot Fee", "GroypFi Bot Fee"]);
const GIFTED_FEE_COMMENTS = new Set(["Gifted Fees", "Gifted Marketplace Fees"]);
const isWalletlessFee = (comment?: string) => comment === "walletless fee" || !!comment?.startsWith("walletless fee ");

// volume = swap fee / 1% (highest observed rate, so a lower bound; see header)
const VOLUME_PER_SWAP_FEE = 100n;

// Opcodes from https://github.com/ton-blockchain/abis/tree/master/data/dedust
// uranus/meme/types/dedust_uranus_meme_v3.types.tolk
const URANUS_CLAIM_PARTNER_FEE = "0x7f4bcbf4";
const URANUS_PAYOUT = "0x66c8ad72";
// cpmm_v2/types/dedust_v2_cpmm.types.tolk
const CPMM_CLAIM_CREATOR_FEES = "0xbe3e3179";
const CPMM_PAYOUT_POSITION_FEES = "0x29ff1bcf";
const CPMM_PAYOUT = "0x3216ca09";

const LABELS = {
  SWAP: "Swap Fees",
  GIFTED: "Gifted Marketplace Fees",
  WALLETLESS: "Walletless Fees",
  URANUS_PARTNER: "Uranus Partner Fees",
  POOL_CREATOR: "Graduated Pool Creator Fees",
  POOL_LP: "Graduated Pool LP Fees",
};

// Payout opcode -> opcode of the request that triggered it -> label. Both payout opcodes are also sent for
// other operations (buy callbacks, swap payouts), so the request is read from the payout's trace.
const TRACE_PAYOUTS: Record<string, Record<string, string>> = {
  [URANUS_PAYOUT]: { [URANUS_CLAIM_PARTNER_FEE]: LABELS.URANUS_PARTNER },
  [CPMM_PAYOUT]: { [CPMM_CLAIM_CREATOR_FEES]: LABELS.POOL_CREATOR, [CPMM_PAYOUT_POSITION_FEES]: LABELS.POOL_LP },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  // deduped by hash and restricted to [start, end) by the helper
  const txs = await pageToncenterTxs({ account: FEE_RECIPIENT, startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp });
  const payouts: any[] = [];
  for (const tx of txs) {
    if (tx.description?.action?.success === false) continue;

    const inMsg = tx.in_msg;
    if (!inMsg || inMsg.bounced) continue;
    if (inMsg.destination?.toLowerCase() !== FEE_RECIPIENT) continue;
    // The house wallet pays itself a "GroypFi Fee" when it buys through its own app (token buybacks), not a user fee
    if (inMsg.source?.toLowerCase() === FEE_RECIPIENT) continue;

    const comment = inMsg.message_content?.decoded?.comment;
    if (SWAP_FEE_COMMENTS.has(comment)) {
      dailyFees.addGasToken(inMsg.value, LABELS.SWAP);
      dailyVolume.addGasToken((toBigInt(inMsg.value) * VOLUME_PER_SWAP_FEE).toString());
    } else if (GIFTED_FEE_COMMENTS.has(comment)) {
      dailyFees.addGasToken(inMsg.value, LABELS.GIFTED);
    } else if (isWalletlessFee(comment)) {
      dailyFees.addGasToken(inMsg.value, LABELS.WALLETLESS);
    } else if (TRACE_PAYOUTS[inMsg.opcode]) {
      if (!tx.trace_id) throw new Error(`Missing trace ID for payout ${tx.hash}`);
      payouts.push(tx);
    }
  }

  // Claims are batched, so one trace covers many payouts; the claim request may sit in an earlier window
  const traceTxs = new Map<string, any[]>();
  for (const traceId of new Set<string>(payouts.map(tx => tx.trace_id))) {
    const response = await toncenterGet({ path: "traces", params: { trace_id: traceId } });
    const trace = response.traces?.[0];
    if (!trace || trace.is_incomplete || trace.trace_info?.trace_state !== "complete")
      throw new Error(`Incomplete payout trace: ${traceId}`);
    traceTxs.set(traceId, Object.values(trace.transactions ?? {}));
  }
  for (const tx of payouts) {
    const sender = traceTxs.get(tx.trace_id)!.find(t => t.out_msgs?.some((m: any) => m.hash === tx.in_msg.hash));
    if (!sender) throw new Error(`Missing payout sender: ${tx.hash}`);
    const label = TRACE_PAYOUTS[tx.in_msg.opcode][sender.in_msg?.opcode];
    if (label) dailyFees.addGasToken(tx.in_msg.value, label);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Volume: "Swap volume through the GroypFi web app and Telegram bot, estimated as swap fees divided by the 1% maximum fee rate; trades on discounted rates make this a lower bound.",
  Fees: "Swap fees from the GroypFi web app and Telegram bot, Gifted marketplace and walletless fees, and GroypFi's partner, pool-creator and LP share of trading fees on DeDust Uranus launchpad tokens, excluding the house wallet's own trades, deposits, NFT mint proceeds and gas refunds.",
  Revenue: "All swap, Gifted marketplace, walletless and Uranus launchpad fees received by the GroypFi house wallet are kept by the protocol.",
  ProtocolRevenue: "All swap, Gifted marketplace, walletless and Uranus launchpad fees go to the GroypFi house wallet (treasury).",
};

const feeBreakdown = {
  [LABELS.SWAP]: "Fee sent to the house wallet on swaps through the GroypFi web app (Swap Widget, Terminal Quick Buy, launchpad trading) and the Telegram bot.",
  [LABELS.GIFTED]: "Fees from the Gifted marketplace sent to the house wallet.",
  [LABELS.WALLETLESS]: "Fees from walletless trades sent to the house wallet.",
  [LABELS.URANUS_PARTNER]: "GroypFi's partner share of DeDust Uranus bonding-curve trading fees, claimed by the house wallet.",
  [LABELS.POOL_CREATOR]: "Creator share of trading fees on DeDust v2 pools of graduated Uranus tokens, where the house wallet is the pool creator, claimed by the house wallet.",
  [LABELS.POOL_LP]: "Trading fees earned by the liquidity positions the house wallet receives when Uranus tokens graduate to DeDust v2 pools, claimed by the house wallet.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-12-11", // first transaction of the house fee wallet
  methodology,
  breakdownMethodology: {
    Fees: feeBreakdown,
    Revenue: feeBreakdown,
    ProtocolRevenue: feeBreakdown,
  },
  pullHourly: true,
};

export default adapter;
