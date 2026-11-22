import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { normAddr, pageToncenterMessages, pageToncenterTxs, toBigInt, toncenterGet, toRawAddress } from "../../helpers/ton";

// House wallets listed by the GroypFi team in #11236; groypfihouse.ton also runs the $GROYP buybacks
const HOUSE_WALLETS = [
  "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594", // UQDu4AiT… groypfihouse.ton
  "0:af94d0d471526ae79c55355f41bc20b529468c5547ad9d492bfec4a8bc74cb99", // UQCvlNDU… creatorfees.ton, pays launchpad token creators
  "0:2e31f654710a223adf92e2f5898654f64257b082b9a2f7d010e084848c308021", // UQAuMfZU…
  "0:f3ffa1f2aead8080c216c384b9c4f1fd38131c69ead1a75e32f784fe711262b2", // UQDz_6Hy…
];
const HOUSE = new Set(HOUSE_WALLETS);

// Creator share of launchpad fees, paid out of the house wallets. Deducted from 2026-05-23, the first ClaimPartnerFee:
// before it launchpad fees went to groypfilaunchpad.ton (0:a58244…) and are not counted here.
const isCreatorPayout = (comment?: string) => !!comment && /creator|topblast rewards|toplast rewards/i.test(comment);
const CREATOR_PAYOUTS_START = 1779494400;

const GROYP = "0:2dc28eaa30dc2daf489303d78a559df672e002149d1529defc1ab05639ef37f9"; // EQAtwo6qMNwtr0iTA9eKVZ32cuACFJ0VKd78GrBWOe83-X1P
const USDT = toRawAddress(ADDRESSES.ton.USDT);
// toncenter reports TON paid into STON.fi routers as the pTON master (1:1 TON), and as null on other DEXs
const PTON_MASTERS = new Set([
  "0:8cdc1d7640ad5ee326527fc1ad0514f468b30dc84b0173f0e155f451b4e11f7c", // pTON v1
  "0:671963027f7f85659ab55b821671688601cdcf1ee674fc7fbbb1a776a18d34a3", // pTON v2.1
]);

// OTC Desk orders are the contracts an OtcFactory sent InitOrder to; an order sends the house only its fill fee
const OTC_FACTORIES = [
  "0:3cad942683064522b8ce8d8b6c5da20a5612108a077df21f4fbd0fb4caef5ca7", // OtcFactory v3
  "0:d5a966d0bcc9a4685d49dc925236e412f0af3d0bb31ce389c0a17b158f921718", // OtcFactory v2
];
const OTC_INIT_ORDER = "0x4f544332";
const OTC_START = 1794684130; // first OtcFactory v2 transaction, 2026-11-14

const SWAP_FEE_COMMENTS = new Set(["GroypFi Fee", "Gbot Fee", "GroypFi Bot Fee"]);
const GIFTED_FEE_COMMENTS = new Set(["Gifted Fees", "Gifted Marketplace Fees"]);
const isWalletlessFee = (comment?: string) => comment === "walletless fee" || !!comment?.startsWith("walletless fee ");

// volume = swap fee / 1% (highest observed rate, so a lower bound)
const VOLUME_PER_SWAP_FEE = 100n;

// Opcodes from https://github.com/ton-blockchain/abis/tree/master/data/dedust
const URANUS_CLAIM_PARTNER_FEE = "0x7f4bcbf4";
const URANUS_PAYOUT = "0x66c8ad72";
const CPMM_CLAIM_CREATOR_FEES = "0xbe3e3179";
const CPMM_PAYOUT_POSITION_FEES = "0x29ff1bcf";
const CPMM_PAYOUT = "0x3216ca09";

const LABELS = {
  SWAP: "Swap Fees",
  GIFTED: "Gifted Marketplace Fees",
  WALLETLESS: "Walletless Fees",
  OTC: "OTC Desk Fees",
  URANUS_PARTNER: "Uranus Partner Fees",
  POOL_CREATOR: "Graduated Pool Creator Fees",
  POOL_LP: "Graduated Pool LP Fees",
  LAUNCHPAD_RETAINED: "Launchpad Fees Retained",
};

// Payout opcode -> opcode of the request that triggered it -> label. Both payout opcodes are also sent for
// other operations (buy callbacks, swap payouts), so the request is read from the payout's trace.
const TRACE_PAYOUTS: Record<string, Record<string, string>> = {
  [URANUS_PAYOUT]: { [URANUS_CLAIM_PARTNER_FEE]: LABELS.URANUS_PARTNER },
  [CPMM_PAYOUT]: { [CPMM_CLAIM_CREATOR_FEES]: LABELS.POOL_CREATOR, [CPMM_PAYOUT_POSITION_FEES]: LABELS.POOL_LP },
};

async function getOtcOrders(endTimestamp: number): Promise<Set<string>> {
  const orders = new Set<string>();
  if (endTimestamp <= OTC_START) return orders;
  for (const source of OTC_FACTORIES) {
    const messages = await pageToncenterMessages({ source, opcode: OTC_INIT_ORDER, startTimestamp: OTC_START, endTimestamp });
    for (const m of messages) orders.add(normAddr(m.destination));
  }
  return orders;
}

async function getBuybacks(options: FetchOptions) {
  const { startTimestamp, endTimestamp } = options;
  const dailyHoldersRevenue = options.createBalances();
  const seen = new Set<string>();
  const limit = 1000;
  for (const account of HOUSE_WALLETS) {
    for (let offset = 0; ; offset += limit) {
      const res = await toncenterGet({
        path: "actions",
        params: { account, action_type: "jetton_swap", start_utime: startTimestamp, end_utime: endTimestamp - 1, limit, offset, sort: "asc" },
      });
      if (!Array.isArray(res?.actions)) throw new Error(`Expected an actions array from toncenter for ${account}`);
      for (const action of res.actions) {
        const d = action.details ?? {};
        if (seen.has(action.action_id) || action.success === false) continue;
        if (action.start_utime < startTimestamp || action.start_utime >= endTimestamp) continue;
        if (!HOUSE.has(normAddr(d.sender)) || normAddr(d.asset_out) !== GROYP) continue;
        seen.add(action.action_id);
        const spent = d.dex_incoming_transfer?.amount;
        const assetIn = normAddr(d.asset_in);
        if (!assetIn || PTON_MASTERS.has(assetIn)) dailyHoldersRevenue.addGasToken(spent, METRIC.TOKEN_BUY_BACK);
        else if (assetIn === USDT) dailyHoldersRevenue.add(ADDRESSES.ton.USDT, spent, METRIC.TOKEN_BUY_BACK);
      }
      if (res.actions.length < limit) break;
    }
  }
  return dailyHoldersRevenue;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();
  const addFee = (value: any, label: string, revenueLabel = label) => {
    dailyFees.addGasToken(value, label);
    dailyRevenue.addGasToken(value, revenueLabel);
  };

  const orders = await getOtcOrders(options.endTimestamp);
  // deduped by hash and restricted to [start, end) by the helper
  const txs = await pageToncenterTxs({ account: HOUSE_WALLETS, startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp });
  const payouts: any[] = [];
  for (const tx of txs) {
    if (tx.description?.action?.success === false) continue;

    if (tx.now >= CREATOR_PAYOUTS_START) {
      for (const m of tx.out_msgs ?? []) {
        if (isCreatorPayout(m.message_content?.decoded?.comment) && !HOUSE.has(normAddr(m.destination)))
          dailySupplySideRevenue.addGasToken(m.value, METRIC.CREATOR_FEES);
      }
    }

    const inMsg = tx.in_msg;
    if (!inMsg?.source || inMsg.bounced) continue;
    if (!HOUSE.has(normAddr(inMsg.destination))) continue;
    const source = normAddr(inMsg.source);
    // includes the "GroypFi Fee" the house pays itself when it buys through its own app (buybacks)
    if (HOUSE.has(source)) continue;
    if (orders.has(source)) {
      addFee(inMsg.value, LABELS.OTC);
      continue;
    }

    const comment = inMsg.message_content?.decoded?.comment;
    if (SWAP_FEE_COMMENTS.has(comment)) {
      addFee(inMsg.value, LABELS.SWAP);
      dailyVolume.addGasToken((toBigInt(inMsg.value) * VOLUME_PER_SWAP_FEE).toString());
    } else if (GIFTED_FEE_COMMENTS.has(comment)) {
      addFee(inMsg.value, LABELS.GIFTED);
    } else if (isWalletlessFee(comment)) {
      addFee(inMsg.value, LABELS.WALLETLESS);
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
    if (label) addFee(tx.in_msg.value, label, LABELS.LAUNCHPAD_RETAINED);
  }
  dailyRevenue.subtract(dailySupplySideRevenue, LABELS.LAUNCHPAD_RETAINED);

  const dailyHoldersRevenue = await getBuybacks(options);

  // One label, so buybacks net into the retained fees; negative when a buyback spends fees from earlier days
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addBalances(dailyRevenue, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, METRIC.PROTOCOL_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Volume: "Swap volume through the GroypFi web app and Gbot Telegram bot, estimated as swap fees divided by the 1% top fee rate; trades on discounted rates make this a lower bound.",
  Fees: "Swap fees from the GroypFi web app and Gbot, Gifted marketplace, walletless and OTC Desk fill fees, and GroypFi's partner, pool-creator and LP share of trading fees on DeDust Uranus launchpad tokens, received by the GroypFi house wallets. Transfers between house wallets, the house wallets' own trades, deposits, NFT mint proceeds and gas refunds are excluded.",
  Revenue: "Fees kept by GroypFi: all swap, Gifted marketplace, walletless and OTC Desk fees, plus the launchpad fees left after the token creators' share is paid out.",
  SupplySideRevenue: "Share of launchpad fees GroypFi pays to the creators of topblast.lol (formerly Groypad) tokens from the house wallets and creatorfees.ton, counted from 2026-05-23, when the house wallet started claiming those fees itself.",
  ProtocolRevenue: "Fees kept in the GroypFi house wallets after the $GROYP buybacks paid from them.",
  HoldersRevenue: "TON and USD₮ the GroypFi house wallets spend buying back $GROYP on STON.fi, DeDust and TONCO, which is then burned.",
};

const feeBreakdown = {
  [LABELS.SWAP]: "Fee sent to a house wallet on swaps through the GroypFi web app (Swap, Terminal, launchpad trading) and the Gbot Telegram bot.",
  [LABELS.GIFTED]: "Fees from the Gifted marketplace sent to a house wallet.",
  [LABELS.WALLETLESS]: "Fees from walletless trades sent to a house wallet.",
  [LABELS.OTC]: "OTC Desk fill fee, 0.5% from the buyer plus 0.5% from the seller, sent to a house wallet by orders deployed by the GroypFi OtcFactory contracts.",
  [LABELS.URANUS_PARTNER]: "GroypFi's partner share of DeDust Uranus bonding-curve trading fees, claimed by a house wallet.",
  [LABELS.POOL_CREATOR]: "Creator share of trading fees on DeDust v2 pools of graduated Uranus tokens, where the house wallet is the pool creator, claimed by a house wallet.",
  [LABELS.POOL_LP]: "Trading fees earned by the liquidity positions the house wallet receives when Uranus tokens graduate to DeDust v2 pools, claimed by a house wallet.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-12-11", // first transaction of the house fee wallet
  methodology,
  breakdownMethodology: {
    Fees: feeBreakdown,
    Revenue: {
      [LABELS.SWAP]: feeBreakdown[LABELS.SWAP],
      [LABELS.GIFTED]: feeBreakdown[LABELS.GIFTED],
      [LABELS.WALLETLESS]: feeBreakdown[LABELS.WALLETLESS],
      [LABELS.OTC]: feeBreakdown[LABELS.OTC],
      [LABELS.LAUNCHPAD_RETAINED]: "Uranus partner fees and graduated-pool creator and LP fees claimed by the house wallet, minus the share paid out to the token creators; negative on days a payout covers fees claimed earlier.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Creator share of launchpad fees paid to topblast.lol (formerly Groypad) token creators, labelled Creator Rewards / Creator Fees / Topblast Rewards on-chain.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Fees kept in the house wallets after the $GROYP buybacks paid from them; negative on days a buyback spends fees from earlier days.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "TON and USD₮ spent by the house wallets buying back $GROYP.",
    },
  },
  pullHourly: true,
  allowNegativeValue: true, // a creator payout or $GROYP buyback can spend fees received in earlier hours or days
};

export default adapter;
