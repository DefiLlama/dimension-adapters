import { PromisePool } from "@supercharge/promise-pool";
import { BaseAdapter, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface ChainConfig {
  burnRouter: string;
  exchangeRouter: string;
  transferRouter: string;
  teleBTC: string;
  // TST staking contract that receives part of the Locker fee for TST stakers (set as rewardDistributor on the routers)
  tstStaking?: string;
  startDate: string;
}

interface UnwrapEvent {
  lockerTargetAddress: string;
  requestIdOfLocker: bigint;
  inputToken: string;
  amounts: [bigint, bigint, bigint];
  fees: [bigint, bigint, bigint, bigint];
}

interface PaidUnwrapEvent {
  lockerTargetAddress: string;
  requestIdOfLocker: bigint;
  bitcoinTxId: string;
}

interface WrapEvent {
  amounts: [number, number];
  fees: [number, number, number, number];
}

interface WrapAndSwapV1Event {
  inputAndOutputToken: [string, string];
  inputAndOutputAmount: [number, number];
  fees: [number, number, number, number, number];
}

interface WrapAndSwapV2Event {
  inputIntermediaryOutputToken: [string, string, string];
  inputIntermediaryOutputAmount: [number, number, number];
  fees: [number, number, number, number, number];
}

interface RewardDepositedEvent {
  sender: string;
  rewardToken: string;
  rewardAmount: bigint;
}

type Balances = ReturnType<FetchOptions["createBalances"]>;

interface Accumulators {
  dailyVolume: Balances;
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailySupplySideRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailyHoldersRevenue: Balances;
}

// Configuration
const CHAIN_CONFIGS: Partial<Record<CHAIN, ChainConfig>> = {
  [CHAIN.POLYGON]: {
    burnRouter: "0x0009876C47F6b2f0BCB41eb9729736757486c75f",
    exchangeRouter: "0xD1E9Ff33EC28f9Dd8D99E685a2B0F29dCaa095a3",
    transferRouter: "0x04367D74332137908BEF9acc0Ab00a299A823707",
    teleBTC: "0x3BF668Fe1ec79a84cA8481CEAD5dbb30d61cC685",
    // rewardDistributor() of the Polygon burn and exchange routers
    tstStaking: "0x19361d42166a1BB7104b3AAF3C00bF71D8aa46e2",
    startDate: "2024-01-01",
  },
  [CHAIN.BSC]: {
    burnRouter: "0x2787D48e0B74125597DD479978a5DE09Bb9a3C15",
    exchangeRouter: "0xcA5416364720c7324A547d39b1db496A2DCd4F0D",
    transferRouter: "0xA38aD0d52B89C20c2229E916358D2CeB45BeC5FF",
    teleBTC: "0xC58C1117DA964aEbe91fEF88f6f5703e79bdA574",
    startDate: "2024-01-01",
  },
  [CHAIN.BOB]: {
    burnRouter: "0x754DC006F4a748f80CcaF27C0efBfF412e54160D",
    exchangeRouter: "0xd724e5709dF7DC4B4dDd14B644118774146b9492",
    transferRouter: "0x25BEf4b1Ca5985661657B3B71f29c0994C36Bbba",
    teleBTC: "0x0670bEeDC28E9bF0748cB254ABd946c87f033D9d",
    startDate: "2024-01-01",
  },
  [CHAIN.BSQUARED]: {
    burnRouter: "0x84da07E1B81e3125A66124F37bEA4897e0bB4b90",
    exchangeRouter: "0xE0166434A2ad67536B5FdAFCc9a6C1B41CC5e085",
    transferRouter: "0x9042B082A31343dFf352412136fA52157ff7fdC8",
    teleBTC: "0x05698eaD40cD0941e6E5B04cDbd56CB470Db762A",
    startDate: "2024-01-01",
  },
};

const EVENT_SIGNATURES = {
  NEW_UNWRAP:
    "event NewUnwrap(bytes userScript,uint8 scriptType,address lockerTargetAddress,address indexed userTargetAddress,uint256 requestIdOfLocker,uint256 indexed deadline,uint256 thirdPartyId,address inputToken,uint256[3] amounts,uint256[4] fees)",
  PAID_UNWRAP:
    "event PaidUnwrap(address indexed lockerTargetAddress,uint256 requestIdOfLocker,bytes32 bitcoinTxId,uint256 bitcoinTxOutputIndex)",
  NEW_WRAP_AND_SWAP_V1:
    "event NewWrapAndSwap(address lockerTargetAddress,address indexed user,address[2] inputAndOutputToken,uint256[2] inputAndOutputAmount,uint256 indexed speed,address indexed teleporter,bytes32 bitcoinTxId,uint256 appId,uint256 thirdPartyId,uint256[5] fees,uint256 destinationChainId)",
  NEW_WRAP_AND_SWAP_V2:
    "event NewWrapAndSwapV2(address lockerTargetAddress,bytes32 indexed user,bytes32[3] inputIntermediaryOutputToken,uint256[3] inputIntermediaryOutputAmount,uint256 indexed speed,address indexed teleporter,bytes32 bitcoinTxId,uint256 appId,uint256 thirdPartyId,uint256[5] fees,uint256 destinationChainId)",
  NEW_WRAP:
    "event NewWrap(bytes32 bitcoinTxId,bytes indexed lockerLockingScript,address lockerTargetAddress,address indexed user,address teleporter,uint256[2] amounts,uint256[4] fees,uint256 thirdPartyId,uint256 destinationChainId)",
  REWARD_DEPOSITED:
    "event RewardDeposited(address sender,address indexed locker,address indexed rewardToken,uint256 totalAmount,uint256 rewardAmount)",
} as const;

// Every event's fee array: index 1 = Locker fee, index 2 = protocol fee and index 3 = referral fee.
// Lockers are operated by the TeleSwap protocol, so the Locker fee is protocol revenue (minus the
// share the TST staking contract passes on to stakers). On unwraps, index 0 is the Bitcoin network
// fee the user pays the Locker to cover the Bitcoin payout tx; it is handled in processUnwrapPayments.
// On wraps index 0 (teleporter fee) and index 4 (bridge fee) are passthrough and not counted.
const FEE_INDICES = {
  NETWORK_FEE: 0,
  LOCKER_FEE: 1,
  PROTOCOL_FEE: 2,
  THIRD_PARTY_FEE: 3,
} as const;

// Lockers usually pay an unwrap within ~1h of the request (p99 1.2h, max 41h on Polygon over a
// week of data). Requests are looked up this far back; older ones fall back to a wider window.
const UNWRAP_LOOKBACK = 3 * 24 * 3600;
const UNWRAP_FALLBACK_LOOKBACK = 30 * 24 * 3600;

const BITCOIN_APIS = ["https://mempool.space/api", "https://blockstream.info/api"];

function recordFees(
  acc: Accumulators,
  teleBTC: string,
  fees: readonly (number | bigint)[]
): void {
  const lockerFee = fees[FEE_INDICES.LOCKER_FEE];
  const protocolFee = fees[FEE_INDICES.PROTOCOL_FEE];
  const thirdPartyFee = fees[FEE_INDICES.THIRD_PARTY_FEE];
  acc.dailyFees.add(teleBTC, lockerFee, "Locker Fees");
  acc.dailyFees.add(teleBTC, protocolFee, "Protocol Fees");
  acc.dailyFees.add(teleBTC, thirdPartyFee, "Third Party Fees");

  acc.dailyRevenue.add(teleBTC, lockerFee, "Locker Fees");
  acc.dailyRevenue.add(teleBTC, protocolFee, "Protocol Fees");

  acc.dailyProtocolRevenue.add(teleBTC, lockerFee, "Locker Fees");
  acc.dailyProtocolRevenue.add(teleBTC, protocolFee, "Protocol Fees");

  acc.dailySupplySideRevenue.add(teleBTC, thirdPartyFee, "Third Party Fees");
}

const unwrapKey = (locker: string, requestIdOfLocker: bigint) =>
  `${locker.toLowerCase()}-${requestIdOfLocker}`;

// Fee paid on Bitcoin and the number of outputs paying users (outputs not returning to an input
// script, i.e. excluding the Locker's change). One Bitcoin tx can pay several unwraps, so each
// unwrap's share of the miner fee is fee / payments.
async function getBitcoinTxCost(txId: string): Promise<{ fee: number; payments: number }> {
  // bitcoinTxId is emitted in internal byte order; explorers use the reversed (display) order
  const displayTxId = Buffer.from(txId.slice(2), "hex").reverse().toString("hex");
  let lastError: unknown;
  for (const api of BITCOIN_APIS) {
    try {
      const tx = await httpGet(`${api}/tx/${displayTxId}`);
      const inputScripts = new Set(tx.vin.map((input: any) => input.prevout.scriptpubkey));
      const payments = tx.vout.filter(
        (output: any) => !inputScripts.has(output.scriptpubkey) && output.scriptpubkey_type !== "op_return"
      ).length;
      return { fee: tx.fee, payments };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Failed to fetch Bitcoin tx ${displayTxId}: ${(lastError as Error)?.message}`);
}

async function getUnwrapLogs(options: FetchOptions, config: ChainConfig, fromTimestamp: number, toBlock?: number) {
  const fromBlock = await options.getBlock(fromTimestamp, options.chain, {});
  return options.getLogs({
    target: config.burnRouter,
    eventAbi: EVENT_SIGNATURES.NEW_UNWRAP,
    onlyArgs: false,
    fromBlock,
    toBlock,
  });
}

async function processUnwrapEvents(
  options: FetchOptions,
  config: ChainConfig,
  acc: Accumulators
): Promise<void> {
  // Requests are fetched with a lookback so payments in this window can be matched to their request
  const [windowFromBlock, unwrapLogs, paidLogs] = await Promise.all([
    options.getFromBlock(),
    getUnwrapLogs(options, config, options.startTimestamp - UNWRAP_LOOKBACK),
    options.getLogs({
      target: config.burnRouter,
      eventAbi: EVENT_SIGNATURES.PAID_UNWRAP,
    }),
  ]);

  const requests = new Map<string, UnwrapEvent>();
  for (const unwrapLog of unwrapLogs) {
    const event = unwrapLog.args as UnwrapEvent;
    requests.set(unwrapKey(event.lockerTargetAddress, event.requestIdOfLocker), event);
    if (unwrapLog.blockNumber < windowFromBlock) continue;

    // Add volume from input token amount
    acc.dailyVolume.add(event.inputToken, event.amounts[0]);

    recordFees(acc, config.teleBTC, event.fees);
  }

  const payments = paidLogs as PaidUnwrapEvent[];
  if (!payments.length) return;

  if (payments.some((p) => !requests.has(unwrapKey(p.lockerTargetAddress, p.requestIdOfLocker)))) {
    const olderLogs = await getUnwrapLogs(options, config, options.startTimestamp - UNWRAP_FALLBACK_LOOKBACK, unwrapLogs[0]?.blockNumber);
    for (const unwrapLog of olderLogs) {
      const event = unwrapLog.args as UnwrapEvent;
      requests.set(unwrapKey(event.lockerTargetAddress, event.requestIdOfLocker), event);
    }
  }

  const paymentsPerTx: Record<string, number> = {};
  for (const payment of payments) {
    paymentsPerTx[payment.bitcoinTxId] = (paymentsPerTx[payment.bitcoinTxId] ?? 0) + 1;
  }

  const txCosts: Record<string, { fee: number; payments: number }> = {};
  await PromisePool.withConcurrency(5)
    .for(Object.keys(paymentsPerTx))
    .handleError((error) => { throw error; })
    .process(async (txId) => {
      txCosts[txId] = await getBitcoinTxCost(txId);
    });

  for (const payment of payments) {
    const request = requests.get(unwrapKey(payment.lockerTargetAddress, payment.requestIdOfLocker));
    if (!request) {
      throw new Error(`NewUnwrap not found for locker ${payment.lockerTargetAddress} request ${payment.requestIdOfLocker}`);
    }
    const networkFee = Number(request.fees[FEE_INDICES.NETWORK_FEE]);
    const { fee, payments: txPayments } = txCosts[payment.bitcoinTxId];
    // A Bitcoin tx can also pay unwraps requested on other chains, so the output count is used when larger
    const bitcoinCost = fee / Math.max(txPayments, paymentsPerTx[payment.bitcoinTxId]);

    acc.dailyFees.add(config.teleBTC, networkFee, "Network Fees");

    acc.dailyRevenue.add(config.teleBTC, networkFee, "Network Fees");
    acc.dailyRevenue.subtractToken(config.teleBTC, bitcoinCost, "Network Fees");

    acc.dailyProtocolRevenue.add(config.teleBTC, networkFee, "Network Fees");
    acc.dailyProtocolRevenue.subtractToken(config.teleBTC, bitcoinCost, "Network Fees");

    acc.dailySupplySideRevenue.add(config.teleBTC, bitcoinCost, "Bitcoin Miner Fees");
  }
}

async function processWrapAndSwapEvents(
  options: FetchOptions,
  config: ChainConfig,
  acc: Accumulators
): Promise<void> {
  const [v1Logs, v2Logs] = await Promise.all([
    options.getLogs({
      target: config.exchangeRouter,
      eventAbi: EVENT_SIGNATURES.NEW_WRAP_AND_SWAP_V1,
    }),
    options.getLogs({
      target: config.exchangeRouter,
      eventAbi: EVENT_SIGNATURES.NEW_WRAP_AND_SWAP_V2,
    }),
  ]);

  for (const log of v1Logs) {
    const event = log as WrapAndSwapV1Event;
    acc.dailyVolume.add(event.inputAndOutputToken[0], event.inputAndOutputAmount[0]);
    recordFees(acc, config.teleBTC, event.fees);
  }

  for (const log of v2Logs) {
    const event = log as WrapAndSwapV2Event;
    acc.dailyVolume.add(config.teleBTC, event.inputIntermediaryOutputAmount[0]);
    recordFees(acc, config.teleBTC, event.fees);
  }
}

async function processWrapEvents(
  options: FetchOptions,
  config: ChainConfig,
  acc: Accumulators
): Promise<void> {
  const wrapLogs = await options.getLogs({
    target: config.transferRouter,
    eventAbi: EVENT_SIGNATURES.NEW_WRAP,
  });

  for (const wrapLog of wrapLogs) {
    const event = wrapLog as WrapEvent;

    // Add volume from input token (teleBTC) amount
    acc.dailyVolume.add(config.teleBTC, event.amounts[0]);

    recordFees(acc, config.teleBTC, event.fees);
  }
}

// The routers send the Locker fee to the TST staking contract, which keeps rewardAmount for TST
// stakers and forwards the rest to the Locker. Deposits happen in the same tx as the bridge event.
async function processStakingRewards(
  options: FetchOptions,
  config: ChainConfig,
  acc: Accumulators
): Promise<void> {
  if (!config.tstStaking) return;

  const routers = new Set(
    [config.burnRouter, config.exchangeRouter, config.transferRouter].map((router) => router.toLowerCase())
  );
  const rewardLogs = await options.getLogs({
    target: config.tstStaking,
    eventAbi: EVENT_SIGNATURES.REWARD_DEPOSITED,
  });

  for (const rewardLog of rewardLogs) {
    const event = rewardLog as RewardDepositedEvent;
    if (!routers.has(event.sender.toLowerCase())) continue;

    acc.dailyHoldersRevenue.add(event.rewardToken, event.rewardAmount, "Locker Fees To TST Stakers");
    acc.dailyProtocolRevenue.subtractToken(event.rewardToken, event.rewardAmount, "Locker Fees");
  }
}

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const acc: Accumulators = {
    dailyVolume: options.createBalances(),
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailyHoldersRevenue: options.createBalances(),
  };

  const config = CHAIN_CONFIGS[options.chain as keyof typeof CHAIN_CONFIGS];
  if (!config) {
    throw new Error(`Configuration not found for chain: ${options.chain}`);
  }

  await Promise.all([
    processUnwrapEvents(options, config, acc),
    processWrapAndSwapEvents(options, config, acc),
    processWrapEvents(options, config, acc),
    processStakingRewards(options, config, acc),
  ]);

  return {
    dailyVolume: acc.dailyVolume,
    dailyFees: acc.dailyFees,
    dailyRevenue: acc.dailyRevenue,
    dailySupplySideRevenue: acc.dailySupplySideRevenue,
    dailyProtocolRevenue: acc.dailyProtocolRevenue,
    dailyHoldersRevenue: acc.dailyHoldersRevenue,
  };
}

const methodology = {
  Volume: "Total value of Bitcoin moved through the bridge — wrapping BTC into teleBTC on EVM chains and unwrapping teleBTC back to BTC.",
  Fees: "All fees users pay to bridge: the Locker fee, protocol fee and referral fee on every wrap and unwrap, plus the Bitcoin network fee charged on unwraps to cover the Bitcoin payout transaction.",
  Revenue: "Fees kept by TeleSwap and TST stakers: the Locker fee (Lockers are run by the protocol), the protocol fee, and the part of the Bitcoin network fee left after paying Bitcoin miners.",
  SupplySideRevenue: "Referral fees paid to third parties that bring users, and the Bitcoin miner fees for the transactions that pay out unwraps. An unwrap's miner fee is the payout transaction's fee divided by the number of unwraps that transaction pays.",
  ProtocolRevenue: "Fees kept by the TeleSwap protocol: the Locker fee minus the share sent to TST stakers, the protocol fee, and the Bitcoin network fee charged on unwraps minus the Bitcoin miner fee actually paid.",
  HoldersRevenue: "The share of Locker fees the TST staking contract on Polygon distributes to TST stakers.",
}

const breakdownMethodology = {
  Fees: {
    "Locker Fees": "Fee charged on every wrap and unwrap by the Locker, which custodies the BTC and mints teleBTC",
    "Protocol Fees": "Fee charged on every wrap and unwrap by the TeleSwap protocol",
    "Third Party Fees": "Fee for an integrating third party (referrer/frontend), sent to that party's address",
    "Network Fees": "Bitcoin network fee charged on unwraps to cover the Bitcoin transaction that pays the user",
  },
  Revenue: {
    "Locker Fees": "Locker fees, kept by the protocol-run Lockers and TST stakers",
    "Protocol Fees": "Protocol fees, kept by the TeleSwap protocol",
    "Network Fees": "Bitcoin network fees charged on unwraps minus each unwrap's share of the Bitcoin miner fee actually paid",
  },
  ProtocolRevenue: {
    "Locker Fees": "Locker fees kept by the protocol-run Lockers, after the share sent to TST stakers",
    "Protocol Fees": "Protocol fees, kept by the TeleSwap protocol",
    "Network Fees": "Bitcoin network fees charged on unwraps minus each unwrap's share of the Bitcoin miner fee actually paid",
  },
  HoldersRevenue: {
    "Locker Fees To TST Stakers": "Share of Locker fees the TST staking contract distributes to TST stakers",
  },
  SupplySideRevenue: {
    "Third Party Fees": "Fee for an integrating third party (referrer/frontend), sent to that party's address",
    "Bitcoin Miner Fees": "Each unwrap's share of the Bitcoin miner fee for the transaction that paid it out (the transaction fee divided by the number of unwraps it pays)",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Revenue nets the Bitcoin miner fee of unwrap payouts against the network fee charged; when Bitcoin
  // fees spike a payout can cost more than the fee charged, so an hour with few new requests can be negative
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
  adapter: {}
};

for (const [chain, config] of Object.entries(CHAIN_CONFIGS)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch,
    start: config.startDate,
  }
};

export default adapter;
