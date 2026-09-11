import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { httpPost } from "../../utils/fetchURL";

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

async function cowPartnersByUid(uids: string[]): Promise<Map<string, CowPartner>> {
  const unique = [...new Set(uids.filter((uid) => uid.length >= 114))];
  const out = new Map<string, CowPartner>();
  for (let i = 0; i < unique.length; i += 128) {
    const chunk = unique.slice(i, i + 128);
    let rows: any[] = [];
    try {
      rows = await httpPost("https://api.cow.fi/mainnet/api/v1/orders/by_uids", chunk);
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const order = row?.order || row;
      const uid = toOrderUid(order?.uid);
      const partner = cowPartnerFromAppData(order?.fullAppData);
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
  });
  for (const log of swapLogs) {
    addAmount(dailyVolume, log.sellToken, log.amountIn);
  }

  const feeLogs = await options.getLogs({
    target: SETTLEMENT,
    eventAbi: feeCollectedEvent,
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
    "Pennysia-routed volume only (not inner DEX swaps): sell-token input from SwapExecuted on Settlement (SYNC and SODAX opens), CoW Trade.sellAmount when the order's appData partnerFee.recipient is the Settlement fee recipient, Velora Delta OrderSettled.srcAmount when a partner-fee Transfer hits that recipient, and UniswapX Fill output inferred as that fee × 10000 / 50.",
  Fees:
    "Settlement FeeCollected (SYNC surplus capped at 10% of gross, leftover token/ETH sweeps, and gas markup on extra executeSwap msg.value); CoW partner fee on executed buy at the order's partner bps (CIP-75: 75% protocol / 25% CoW); Velora OrderSettled.partnerFee or the matched Transfer; UniswapX fee-output Transfer. No FeeCollected on SODAX intent opens.",
  Revenue:
    "Pennysia retains 100% of Settlement FeeCollected, UniswapX fee outputs, and Velora partner fees at the Settlement fee recipient. CoW protocol revenue is 75% of the partner fee; CIP-75's 25% is supply-side.",
  ProtocolRevenue: "All retained amounts go to the Settlement fee recipient, except CoW's 25% service fee.",
  SupplySideRevenue: "Partner Fees for CoW: CIP-75 service fee (~25% of the partner fee) withheld by CoW Swap on Pennysia-tagged trades. UniswapX and Velora partner fees are paid in full to Pennysia.",
};

const breakdownMethodology = {
  Fees: {
    [SETTLEMENT_FEE]:
      "FeeCollected on Settlement: surplus above the quoted output (capped at 10% of gross), leftover token/ETH sweeps, and gas markup (extra ETH on executeSwap msg.value). ETH↔WETH wrap/unwrap leftover is transferred without FeeCollected and is not in this bucket.",
    [INTENT_FEE]:
      "CoW: partner bps on executed buy from appData (tagged by Settlement feeRecipient). UniswapX / Velora: matched partner-fee Transfer (or Velora OrderSettled.partnerFee) in the fill transaction.",
  },
  Revenue: {
    [SETTLEMENT_FEE]: "Pennysia retains 100% of FeeCollected (surplus, leftover sweeps, and gas markup).",
    [INTENT_FEE]: "UniswapX / Velora: 100% of the fill-tx partner fee. CoW: 75% after CIP-75.",
  },
  ProtocolRevenue: {
    [SETTLEMENT_FEE]: "Collected amounts are sent to the Settlement fee recipient.",
    [INTENT_FEE]: "Matched hard-intent partner fees except CoW's 25% service fee.",
  },
  SupplySideRevenue: {
    [COW_PARTNER_FEE]:
      "Service fee from partner integrations (~25% on average). CIP-75 withholds this share of the CoW partner fee before payout to Pennysia.",
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
