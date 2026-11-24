import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";

// https://basescan.org/address/0x0cf849531f77E4bfE2d869db5b3F9Bca83d68626#code
const OPEN_ORACLE = "0x0cf849531f77E4bfE2d869db5b3F9Bca83d68626";

const USDC = ADDRESSES.base.USDC.toLowerCase();
// The oracle represents native ETH as the zero address.
const ETH = ADDRESSES.null.toLowerCase();

// Tokens listed on openPunt (https://docs.openoracle.org/punt/trading-pairs). A swap is counted only
// when both of its tokens are on this list, so a game cannot be sized against a worthless token.
const ALLOWED_TOKENS = new Set(
  [
    ADDRESSES.null, // ETH
    ADDRESSES.base.USDC,
    "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // cbBTC
    "0xB2000000000000000000008501b13360000cb2EC", // cbZEC
    "0xcb585250f852C6c6bf90434AB21A00f02833a4af", // cbXRP
    "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82", // SOL
    "0xb20000000000000000000078ee7ce2fE4908108C", // NVDAc
    "0xb2000000000000000000008bC8786B856E61707C", // METAc
    "0xb200000000000000000000C2e324d24d7eEcd1fb", // AAPLc
    "0xb2000000000000000000002D0BA3164cc74f58B7", // GOOGLc
    "0xb200000000000000000000d9192b6B456483C2E8", // AMZNc
    "0xB200000000000000000000Ab99cFa739E253872B", // MSFTc
    "0xb2000000000000000000004884b426556b92883d", // MSTRc
    "0xb200000000000000000000397293Cb8cda9a10c5", // SNDKc
    "0xb2000000000000000000007b9fcbd005511aCBd5", // SPCXc
    "0xb2000000000000000000001e800a7f5189430cD0", // TSLAc
    "0xB166E8B140D35D9D8226E40C09f757BAC5A4d87d", // NPC
  ].map((token) => token.toLowerCase()),
);

// DefiLlama's shared list of scam and fake tokens. It overrides the list above, so a listed token
// stops counting if it is ever flagged there.
const BLACKLISTED_TOKENS = new Set(
  getDefaultDexTokensBlacklisted(CHAIN.BASE).map((token) => token.toLowerCase()),
);

// Both events are emitted with log2 and carry the game state as tightly packed bytes,
// not ABI-encoded data, so they are fetched raw and decoded by offset below.
const ReportSubmitted = "event ReportSubmitted(uint256 indexed reportId, bytes packed)";
const ReportDisputed = "event ReportDisputed(uint256 indexed reportId, bytes packed)";
const topicOf = (eventAbi: string) => ethers.EventFragment.from(eventAbi).topicHash;

// Game settings a swap must meet to count. Units are the contract's: fees are 1e7 = 100%,
// multiplier is 100 = 1x.
// Minimum time to dispute a report: its settlement time less its dispute delay, in blocks or
// seconds per the game's time mode. Games timed in blocks and created before Base's Denim upgrade
// ran on 2 s blocks, so their minimum is 2 blocks (4 s); see DENIM_BLOCK below.
const MIN_DISPUTE_WINDOW = 3n;
const MIN_DISPUTE_WINDOW_BLOCKS_BEFORE_DENIM = 2n;
const MAX_TOTAL_FEE = 500n; // swap fee + protocol fee, 0.005%
// Cap on the game's configured token1 escalation multiplier, 2x. Flexible escalation lets a
// disputer voluntarily post more, up to the game's escalation halt.
const MAX_MULTIPLIER = 200n;
// Contract constants: fee precision, the flag for games timed in seconds rather than blocks,
// and the flag that charges fees only once a game has reached its escalation halt.
const FEE_PRECISION = 10_000_000n;
const FLAG_TIME_IN_SECONDS = 1n;
const FLAG_FEES_ONLY_AT_HALT = 32n;

// A dispute is counted only when the round it takes was open to others first, so never when both
// are in one transaction. From the first block of Base's Denim upgrade (2026-11-05 18:00 UTC),
// which made blocks 200 ms, a block is one atomic unit and the round must be from an earlier
// block. Before it blocks were 2 s and built from flashblocks, so separate transactions sharing
// a block were not atomic and still count.
const DENIM_BLOCK = 53556127;

const PACKED_LENGTH = 235;

type Round = {
  blockNumber: number;
  logIndex: number;
  txHash: string;
  reportId: string;
  isDispute: boolean;
  amount1: bigint;
  amount2: bigint;
  reporter: string;
  token1: string;
  token2: string;
  settlementTime: bigint;
  escalationHalt: bigint;
  disputeDelay: bigint;
  swapFee: bigint;
  multiplier: bigint;
  protocolFee: bigint;
  flags: bigint;
  createdBlock: number;
};

// Byte offsets from OpenOracleSlim._packMem:
// currentAmount1 0..16, currentAmount2 16..32, currentReporter 32..52, token1 64..84,
// settlementTime 90..96, escalationHalt 96..112, token2 144..164, disputeDelay 167..170,
// feePercentage 170..173, multiplier 173..175, protocolFee 199..202, flags 202,
// blockNumber the game was created in 229..235.
function toRound(log: any, isDispute: boolean): Round {
  const hex = String(log.data).replace(/^0x/, "");
  if (hex.length !== PACKED_LENGTH * 2) throw new Error(`openOracle: unexpected packed length ${hex.length / 2}`);
  const uint = (from: number, to: number) => BigInt("0x" + hex.slice(from * 2, to * 2));
  const address = (from: number, to: number) => ("0x" + hex.slice(from * 2, to * 2)).toLowerCase();
  const blockNumber = Number(log.blockNumber);
  const logIndex = Number(log.logIndex ?? log.index);
  if (!Number.isFinite(blockNumber) || !Number.isFinite(logIndex) || !log.transactionHash) {
    throw new Error("openOracle: log is missing its position");
  }
  return {
    blockNumber,
    logIndex,
    txHash: String(log.transactionHash).toLowerCase(),
    reportId: String(log.topics[1]).toLowerCase(),
    isDispute,
    amount1: uint(0, 16),
    amount2: uint(16, 32),
    reporter: address(32, 52),
    token1: address(64, 84),
    settlementTime: uint(90, 96),
    escalationHalt: uint(96, 112),
    token2: address(144, 164),
    disputeDelay: uint(167, 170),
    swapFee: uint(170, 173),
    multiplier: uint(173, 175),
    protocolFee: uint(199, 202),
    flags: uint(202, 203),
    createdBlock: Number(uint(229, 235)),
  };
}

const byPosition = (a: Round, b: Round) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

const minimumDisputeWindow = (round: Round) =>
  (round.flags & FLAG_TIME_IN_SECONDS) === 0n && round.createdBlock < DENIM_BLOCK
    ? MIN_DISPUTE_WINDOW_BLOCKS_BEFORE_DENIM
    : MIN_DISPUTE_WINDOW;

// Whether a game's swaps can count at all. Every field read here is fixed when the game is
// created and repeated in each of its events, so any one round answers for the whole game.
const isEligibleGame = (round: Round) =>
  ALLOWED_TOKENS.has(round.token1) && ALLOWED_TOKENS.has(round.token2)
  && !BLACKLISTED_TOKENS.has(round.token1) && !BLACKLISTED_TOKENS.has(round.token2)
  && [round.token1, round.token2].some((token) => token === USDC || token === ETH)
  && round.settlementTime - round.disputeDelay >= minimumDisputeWindow(round)
  && round.swapFee + round.protocolFee <= MAX_TOTAL_FEE
  && round.multiplier <= MAX_MULTIPLIER;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const raw = { target: OPEN_ORACLE, entireLog: true, parseLog: false };

  const [submitted, disputed] = [
    await options.getLogs({ ...raw, eventAbi: ReportSubmitted }),
    await options.getLogs({ ...raw, eventAbi: ReportDisputed }),
  ];
  // Ineligible games are dropped here, before any earlier-round lookup is made for them.
  const rounds = [
    ...submitted.map((log: any) => toRound(log, false)),
    ...disputed.map((log: any) => toRound(log, true)),
  ].filter(isEligibleGame).sort(byPosition);

  // A dispute trades against the round before it. For a game that began before this window that
  // round is not among the logs above, so it is read from the game's own earlier logs.
  const previous: Record<string, Round> = {};
  const seen = new Set<string>();
  const startedEarlier = new Map<string, number>();
  for (const round of rounds) {
    if (round.isDispute && !seen.has(round.reportId)) startedEarlier.set(round.reportId, round.createdBlock);
    seen.add(round.reportId);
  }
  if (startedEarlier.size) {
    const toBlock = (await options.getFromBlock()) - 1;
    for (const [reportId, createdBlock] of startedEarlier) {
      // Every event carries the block its game was created in, so the search starts there.
      // topics[1] is the indexed reportId, so this reads one game's logs only.
      if (!(createdBlock > 0 && createdBlock <= toBlock)) {
        throw new Error(`openOracle: report ${reportId} has no round before this window`);
      }
      const earlier = { ...raw, fromBlock: createdBlock, toBlock };
      const history = [
        ...(await options.getLogs({ ...earlier, topics: [topicOf(ReportSubmitted), reportId] }))
          .map((log: any) => toRound(log, false)),
        ...(await options.getLogs({ ...earlier, topics: [topicOf(ReportDisputed), reportId] }))
          .map((log: any) => toRound(log, true)),
      ].sort(byPosition);
      if (!history.length) throw new Error(`openOracle: no earlier round found for report ${reportId}`);
      previous[reportId] = history[history.length - 1];
    }
  }

  for (const round of rounds) {
    const taken = previous[round.reportId];
    previous[round.reportId] = round;
    // A report only posts a quote. Volume is a dispute, which swaps against the round before it.
    if (!round.isDispute) continue;
    if (!taken) throw new Error(`openOracle: dispute without a previous round for report ${round.reportId}`);
    if (taken.txHash === round.txHash) continue;
    if (round.blockNumber >= DENIM_BLOCK && taken.blockNumber === round.blockNumber) continue;
    // A reporter disputing their own report trades with themselves.
    if (round.reporter === taken.reporter) continue;

    // Volume is gross of fees. The disputer pays the swap and protocol fees in one of the two
    // tokens, on that token's taken amount. Fees paid in the other token are converted at the
    // taken report's own exchange rate.
    const feesInToken2 = round.amount2 * taken.amount1 > taken.amount2 * round.amount1;
    const feesCharged = (round.flags & FLAG_FEES_ONLY_AT_HALT) === 0n || taken.amount1 >= round.escalationHalt;
    const feeBase = feesInToken2 ? taken.amount2 : taken.amount1;
    const fee = feesCharged
      ? (feeBase * round.swapFee) / FEE_PRECISION + (feeBase * round.protocolFee) / FEE_PRECISION
      : 0n;
    const paid = (amount: bigint, isToken2: boolean) =>
      amount + (isToken2 === feesInToken2 ? fee : (fee * amount) / feeBase);

    // One side only, and only a USDC or ETH side: other tokens are never priced.
    if (taken.token1 === USDC) dailyVolume.add(USDC, paid(taken.amount1, false));
    else if (taken.token2 === USDC) dailyVolume.add(USDC, paid(taken.amount2, true));
    else if (taken.token1 === ETH) dailyVolume.addGasToken(paid(taken.amount1, false));
    else if (taken.token2 === ETH) dailyVolume.addGasToken(paid(taken.amount2, true));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-09-01",
  methodology: {
    Volume:
      "Volume counts one side of eligible swaps executed against openOracle price reports on Base, including the initial report when its quote is taken.",
  },
};

export default adapter;
