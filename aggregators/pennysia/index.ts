import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// PennysiaSettlement on Ethereum Mainnet
// https://etherscan.io/address/0x3Aad97E5a91b8e43b7Dc830aCEb004307678795E
const SETTLEMENT = "0x3Aad97E5a91b8e43b7Dc830aCEb004307678795E";
// Default NEXT_PUBLIC_INTENT_FEE_BPS. Used only to invert UniswapX fee outputs
// back to quoted output volume (fee = output * bps / 10000).
const INTENT_FEE_BPS = 50n;

const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const COW_VAULT_RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
const VELORA_DELTA = "0x0000000000bbF5c5Fd284e657F01Bd000933C96D";
// UniswapX reactors on Ethereum (UNISWAPX_V2 quotes settle on V2; include Exclusive + V3)
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

const SURPLUS_FEE = "Surplus Fees";
const INTENT_FEE = "Intent Fees";

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

  const swapLogs = await options.getLogs({
    target: SETTLEMENT,
    eventAbi: swapExecutedEvent,
    // Indexer currently returns an empty set for this custom event; RPC is cheap
    // (single Settlement address, low log volume).
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
    addRetainedFee(log.token, log.amount, SURPLUS_FEE);
  }

  // Incoming ERC-20 to the active Settlement fee recipient(s) tags CoW /
  // UniswapX / Velora hard intents (partnerAddress + partnerFeeBps).
  // extraTopics[1] is Transfer `to`, so this is not a full-chain scan.
  const partnerTransfers = await loadPartnerTransfers(
    options,
    await feeRecipientsInWindow(options),
  );

  const cowTrades = await options.getLogs({
    target: COW_SETTLEMENT,
    eventAbi: cowTradeEvent,
    entireLog: true,
  });
  const cowFroms = new Set([COW_SETTLEMENT, COW_VAULT_RELAYER].map(asAddr));
  for (const log of cowTrades) {
    const a = argsOf(log);
    const fee = takePartnerFee(
      partnerTransfers,
      txHash(log),
      new Set([asAddr(a.buyToken), asAddr(a.sellToken)]),
      cowFroms,
    );
    if (!fee) continue;
    addAmount(dailyVolume, a.sellToken, a.sellAmount);
    // Receipts at the Settlement fee recipient are already Pennysia's share.
    // CIP-75's 25% CoW service fee is withheld before payout and never
    // appears in these logs.
    addRetainedFee(fee.token, fee.value, INTENT_FEE);
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
    "Pennysia-routed volume only (not inner DEX swaps): sell-token input from SwapExecuted on Settlement, plus each hard-intent fill that has a matching fee-output Transfer to the Settlement fee recipient (CoW Trade.sellAmount, Velora Delta OrderSettled.srcAmount, UniswapX Fill output inferred as that fee × 10000 / 50).",
  Fees:
    "Settlement FeeCollected (SYNC surplus, capped at 10% of gross, plus leftover sweeps) and the matched hard-intent partner-fee Transfer (Velora uses OrderSettled.partnerFee when present). No surplus fee on SODAX intent opens.",
  Revenue:
    "Pennysia retains 100% of Settlement surplus and of hard-intent partner-fee receipts at the Settlement fee recipient. UniswapX fee outputs and Velora Delta partner fees are paid in full to that address. CoW CIP-75's 25% service fee is withheld before payout, so it is not in these logs and is not counted as supply-side here.",
  ProtocolRevenue: "All retained amounts go to the Settlement fee recipient.",
  SupplySideRevenue: "None on these logs. CoW's off-chain service fee does not arrive at the Settlement fee recipient.",
};

const breakdownMethodology = {
  Fees: {
    [SURPLUS_FEE]:
      "FeeCollected on Settlement: surplus above the quoted output (capped at 10% of gross) plus leftover token/ETH sweeps.",
    [INTENT_FEE]:
      "Matched partner-fee Transfer (or Velora OrderSettled.partnerFee) to the active Settlement feeRecipient() on CoW, UniswapX, and Velora Delta fills.",
  },
  Revenue: {
    [SURPLUS_FEE]: "Pennysia retains 100% of collected surplus and leftover sweeps.",
    [INTENT_FEE]: "Pennysia retains 100% of partner-fee receipts at the Settlement fee recipient.",
  },
  ProtocolRevenue: {
    [SURPLUS_FEE]: "Collected amounts are sent to the Settlement fee recipient.",
    [INTENT_FEE]: "Matched hard-intent partner fees are sent to the Settlement fee recipient.",
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
