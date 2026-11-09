import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { httpPost } from "../../utils/fetchURL";
import asyncRetry from "async-retry";

// PennysiaSettlement on Ethereum Mainnet
// https://etherscan.io/address/0x3Aad97E5a91b8e43b7Dc830aCEb004307678795E
const SETTLEMENT = "0x3Aad97E5a91b8e43b7Dc830aCEb004307678795E";
// Default NEXT_PUBLIC_INTENT_FEE_BPS. Used only to invert UniswapX fee outputs
// back to quoted output volume (fee = output * bps / 10000).
const INTENT_FEE_BPS = 50n;
// CoW CIP-75 withholds 25% of partner fees before the weekly payout.
const COW_RETAINED_BPS = 75n;

const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const VELORA_DELTA = "0x0000000000bbF5c5Fd284e657F01Bd000933C96D";
const UNISWAPX_REACTORS = [
  "0x00000011F84B9aa48e5f8aA8B9897600006289Be", // V2 Dutch
  "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4", // Exclusive Dutch
  "0x0000000015757c461808EA25Eb309638B62681cf", // V3 Dutch
];

const swapExecutedEvent =
  "event SwapExecuted(address indexed recipient, address sellToken, address buyToken, uint256 amountIn, uint256 netBuy, uint256 routeIndex)";
const feeCollectedEvent =
  "event FeeCollected(address indexed token, address indexed recipient, uint256 amount)";
const feeRecipientUpdatedEvent =
  "event FeeRecipientUpdated(address indexed recipient)";
const transferEvent =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const cowTradeEvent =
  "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)";
const uniswapxFillEvent =
  "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const veloraSettledEvent =
  "event OrderSettled(address indexed owner, address indexed beneficiary, uint8 kind, address srcToken, address destToken, uint256 srcAmount, uint256 destAmount, uint256 returnAmount, uint256 protocolFee, uint256 partnerFee, bytes32 indexed orderHash)";

const SETTLEMENT_FEE = "Settlement Fees";
const INTENT_FEE = "Intent Fees";
const COW_PARTNER_FEE = "Partner Fees for CoW";

const NATIVE = new Set([
  ADDRESSES.null.toLowerCase(),
  ADDRESSES.GAS_TOKEN_2.toLowerCase(),
]);

type PartnerTransfer = {
  tx: string;
  token: string;
  from: string;
  value: any;
  used: boolean;
};

type CowPartner = { recipient: string; bps: bigint };

function addAmount(balances: any, token: string, amount: any, label?: string) {
  if (!token || amount == null) return;
  if (NATIVE.has(String(token).toLowerCase())) {
    balances.addGasToken(amount, label);
  } else {
    balances.add(token, amount, label);
  }
}

function padAddress(address: string) {
  return "0x" + address.slice(2).toLowerCase().padStart(64, "0");
}

function txHash(log: any): string {
  return String(log.transactionHash || log.hash || "").toLowerCase();
}

function argsOf(log: any) {
  return log.args || log;
}

function asAddr(value: any) {
  return String(value || "").toLowerCase();
}

function parsePartnerTransfers(logs: any[]): PartnerTransfer[] {
  const out: PartnerTransfer[] = [];
  for (const log of logs) {
    const tx = txHash(log);
    const a = argsOf(log);
    if (!tx || a.value == null) continue;
    out.push({
      tx,
      token: asAddr(log.address),
      from: asAddr(a.from),
      value: a.value,
      used: false,
    });
  }
  return out;
}

function takePartnerFee(
  transfers: PartnerTransfer[],
  tx: string,
  tokens?: Set<string>,
  froms?: Set<string>,
  strictFroms = false,
): PartnerTransfer | undefined {
  const unused = transfers.filter((t) => !t.used && t.tx === tx);
  const match = (pool: PartnerTransfer[]) => {
    const hit = pool.find((t) => !tokens || tokens.has(t.token));
    if (hit) hit.used = true;
    return hit;
  };
  if (froms) {
    const strict = match(unused.filter((t) => froms.has(t.from)));
    if (strict) return strict;
    if (strictFroms) return undefined;
  }
  return match(unused);
}

async function feeRecipientsInWindow(options: FetchOptions): Promise<string[]> {
  const recipients = new Set<string>();
  const readRecipient = async (api: FetchOptions["api"]) => {
    const recipient = await api.call({
      target: SETTLEMENT,
      abi: "address:feeRecipient",
    });
    if (recipient) recipients.add(asAddr(recipient));
  };
  await readRecipient(options.fromApi);
  await readRecipient(options.toApi);
  const updates = await options.getLogs({
    target: SETTLEMENT,
    eventAbi: feeRecipientUpdatedEvent,
    entireLog: true,
    skipIndexer: true,
  });
  for (const log of updates) {
    const recipient = argsOf(log).recipient;
    if (recipient) recipients.add(asAddr(recipient));
  }
  return [...recipients];
}

async function loadPartnerTransfers(
  options: FetchOptions,
  recipients: string[],
): Promise<PartnerTransfer[]> {
  const all: PartnerTransfer[] = [];
  for (const recipient of recipients) {
    const logs = await options.getLogs({
      noTarget: true,
      eventAbi: transferEvent,
      extraTopics: [null, padAddress(recipient)],
      entireLog: true,
    });
    all.push(...parsePartnerTransfers(logs));
  }
  return all;
}

function cowPartnerFromAppData(fullAppData: any): CowPartner | undefined {
  let doc = fullAppData;
  if (typeof fullAppData === "string") {
    try {
      doc = JSON.parse(fullAppData);
    } catch {
      return;
    }
  }
  const raw = doc?.metadata?.partnerFee;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const item of items) {
    const recipient = asAddr(
      item?.recipient || item?.volume?.recipient || item?.surplus?.recipient,
    );
    const bps = BigInt(
      item?.bps ??
        item?.volumeBps ??
        item?.volume_bps ??
        item?.volume?.volumeBps ??
        0,
    );
    if (recipient && recipient !== "0x" && bps > 0n) return { recipient, bps };
  }
}

function toOrderUid(value: any): string {
  const raw = String(value || "").toLowerCase();
  if (raw.startsWith("0x")) return raw;
  return "";
}

const COW_ORDERS_BY_UIDS = "https://api.cow.fi/mainnet/api/v1/orders/by_uids";
// by_uids body cap: 128 UIDs pass, 256 return HTTP 413 (checked 2026-11-08).
const COW_UID_BATCH = 128;
// api.cow.fi answers HTTP 429 to the server only (6, later 12, of 24 hourly slices on 2026-11-08; a 40-request
// burst from elsewhere got no 429), at ~2 requests per slice, so the limit is on the server's IP. Back off and
// retry; once a request exhausts its retries, later calls fail immediately for a few minutes so the hourly job
// (up to 24 slices back-to-back in one 20-minute child) does not time out. Failed slices are re-run next hour.
const COW_OUTAGE_COOLDOWN_MS = 5 * 60 * 1000;
let cowOutage: { error: unknown; until: number } | undefined;

async function cowOrdersByUids(uids: string[]): Promise<any[]> {
  if (cowOutage && Date.now() < cowOutage.until) throw cowOutage.error;
  try {
    return await asyncRetry(
      async () => {
        const rows = await httpPost(COW_ORDERS_BY_UIDS, uids, { timeout: 30_000 });
        if (!Array.isArray(rows)) throw new Error("Unexpected CoW orders response");
        return rows;
      },
      { retries: 4, minTimeout: 2000, maxTimeout: 15_000, factor: 2, randomize: true },
    );
  } catch (error) {
    cowOutage = { error, until: Date.now() + COW_OUTAGE_COOLDOWN_MS };
    throw error;
  }
}

async function cowPartnersByUid(uids: string[]): Promise<Map<string, CowPartner>> {
  const unique = [...new Set(uids.filter((uid) => uid.length >= 114))];
  const out = new Map<string, CowPartner>();
  for (let i = 0; i < unique.length; i += COW_UID_BATCH) {
    const rows = await cowOrdersByUids(unique.slice(i, i + COW_UID_BATCH));
    for (const row of rows) {
      const order = row?.order || row;
      const uid = toOrderUid(order?.uid || row?.uid);
      const partner = cowPartnerFromAppData(
        order?.fullAppData ??
          row?.fullAppData ??
          order?.appData ??
          row?.appData,
      );
      if (uid && partner) out.set(uid, partner);
    }
  }
  return out;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addRetainedFee = (token: string, amount: any, label: string) => {
    addAmount(dailyFees, token, amount, label);
    addAmount(dailyRevenue, token, amount, label);
    addAmount(dailyProtocolRevenue, token, amount, label);
  };

  const recipients = new Set(await feeRecipientsInWindow(options));

  const swapLogs = await options.getLogs({
    target: SETTLEMENT,
    eventAbi: swapExecutedEvent,
    // Custom events are empty in the DefiLlama indexer.
    skipIndexer: true,
  });
  for (const log of swapLogs) {
    addAmount(dailyVolume, log.sellToken, log.amountIn);
  }

  const feeLogs = await options.getLogs({
    target: SETTLEMENT,
    eventAbi: feeCollectedEvent,
    skipIndexer: true,
  });
  for (const log of feeLogs) {
    addRetainedFee(log.token, log.amount, SETTLEMENT_FEE);
  }

  // Incoming ERC-20 to the active Settlement fee recipient tags UniswapX /
  // Velora fills (partner fee is paid in the fill transaction).
  const partnerTransfers = await loadPartnerTransfers(options, [...recipients]);

  const cowTradeLogs = await options.getLogs({
    target: COW_SETTLEMENT,
    eventAbi: cowTradeEvent,
    entireLog: true,
  });
  const cowPartners = await cowPartnersByUid(
    cowTradeLogs.map((log) => toOrderUid(argsOf(log).orderUid)),
  );
  for (const log of cowTradeLogs) {
    const a = argsOf(log);
    const partner = cowPartners.get(toOrderUid(a.orderUid));
    if (!partner || !recipients.has(partner.recipient)) continue;
    addAmount(dailyVolume, a.sellToken, a.sellAmount);
    const gross = BigInt(a.buyAmount) * partner.bps / 10000n;
    const retained = gross * COW_RETAINED_BPS / 100n;
    const cowShare = gross - retained;
    addAmount(dailyFees, a.buyToken, gross, INTENT_FEE);
    addAmount(dailyRevenue, a.buyToken, retained, INTENT_FEE);
    addAmount(dailyProtocolRevenue, a.buyToken, retained, INTENT_FEE);
    if (cowShare > 0n) {
      addAmount(dailySupplySideRevenue, a.buyToken, cowShare, COW_PARTNER_FEE);
    }
  }

  const veloraSettled = await options.getLogs({
    target: VELORA_DELTA,
    eventAbi: veloraSettledEvent,
    entireLog: true,
    skipIndexer: true,
  });
  const veloraFroms = new Set([VELORA_DELTA].map(asAddr));
  for (const log of veloraSettled) {
    const a = argsOf(log);
    const fee = takePartnerFee(
      partnerTransfers,
      txHash(log),
      new Set([asAddr(a.destToken), asAddr(a.srcToken)]),
      veloraFroms,
    );
    if (!fee) continue;
    addAmount(dailyVolume, a.srcToken, a.srcAmount);
    const partnerFee = a.partnerFee;
    addRetainedFee(
      a.destToken || fee.token,
      partnerFee != null && BigInt(partnerFee) > 0n ? partnerFee : fee.value,
      INTENT_FEE,
    );
  }

  const uniFills = await options.getLogs({
    targets: UNISWAPX_REACTORS,
    eventAbi: uniswapxFillEvent,
    entireLog: true,
  });
  for (const log of uniFills) {
    const a = argsOf(log);
    const fee = takePartnerFee(
      partnerTransfers,
      txHash(log),
      undefined,
      new Set([asAddr(log.address), asAddr(a.filler)]),
      true,
    );
    if (!fee) continue;
    addRetainedFee(fee.token, fee.value, INTENT_FEE);
    addAmount(dailyVolume, fee.token, BigInt(fee.value) * 10000n / INTENT_FEE_BPS);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Settlement SwapExecuted (SYNC and SODAX opens) plus CoW, UniswapX, and Velora fills tagged to the Settlement fee recipient.",
  Fees:
    "Settlement FeeCollected plus partner fees on tagged CoW, UniswapX, and Velora fills.",
  Revenue:
    "100% of Settlement, UniswapX, and Velora fees. 75% of CoW partner fees (CIP-75).",
  ProtocolRevenue:
    "100% of Settlement, UniswapX, and Velora fees and 75% of CoW partner fees, paid to the Settlement fee recipient.",
  SupplySideRevenue: "CoW's 25% CIP-75 share of tagged partner fees.",
};

const breakdownMethodology = {
  Fees: {
    [SETTLEMENT_FEE]:
      "FeeCollected on Settlement (surplus cap 10%, leftover sweeps, gas markup on extra msg.value).",
    [INTENT_FEE]:
      "CoW partner bps on executed buy; UniswapX/Velora partner-fee Transfer in the fill tx.",
  },
  Revenue: {
    [SETTLEMENT_FEE]: "100% of FeeCollected.",
    [INTENT_FEE]: "100% of UniswapX/Velora partner fees; 75% of CoW partner fees.",
  },
  ProtocolRevenue: {
    [SETTLEMENT_FEE]: "Paid to the Settlement fee recipient.",
    [INTENT_FEE]: "Hard-intent partner fees except CoW's 25% service fee.",
  },
  SupplySideRevenue: {
    [COW_PARTNER_FEE]: "CoW CIP-75 25% withheld before payout to Pennysia.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-08-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
