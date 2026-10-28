import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";

// OracleCoordinator deployments. v1 is superseded but its fulfilled-request
// fees still count toward protocol revenue; v3 is an ERC1967 UUPS proxy whose
// address is permanent across upgrades.
// https://scan.botchain.ai/address/0x9A39fc7A9385F820CC9820E291519762DA0720a3
const COORDINATORS = [
  "0x8f487264E1B183F588CAc678D000754D3bd9B07E", // v1 (superseded)
  "0x9A39fc7A9385F820CC9820E291519762DA0720a3", // v3 proxy (permanent)
];
// First fulfilled request on v1 (2026-10-05). A challenge can only follow a
// fulfillment, and v3 is later, so this bounds Challenged logs on both.
const CHALLENGED_FROM_BLOCK = 25_647_520;

const RequestFulfilledEvent =
  "event RequestFulfilled(uint256 indexed requestId, address indexed operator, bytes32 outputHash, bytes output)";
const ChallengedEvent =
  "event Challenged(uint256 indexed requestId, address indexed challenger, uint256 bond)";
const ChallengeResolvedEvent =
  "event ChallengeResolved(uint256 indexed requestId, bool challengerWins)";
// `requests()` returns the stored Request struct; field order matches
// contracts/src/OracleCoordinator.sol (requester, modelId, inputHash, fee, ...)
// and is identical on v1 and v3.
const RequestsAbi =
  "function requests(uint256) view returns (address requester, bytes32 modelId, bytes32 inputHash, uint256 fee, address callbackContract, uint64 callbackGasLimit, uint64 createdAt, uint64 fulfilledAt, uint8 status, bytes32 outputHash, address operator, address challenger)";

// Fees accrue on fulfill: a consumer escrows BOT at request time and it is only
// earned when an operator delivers the result (timed-out requests refund in
// full, so RequestSent alone overstates revenue). The contract pays the
// operator fee - protocolFeeBps/10_000 and accrues the cut to the treasury.
// protocolFeeBps (uint16) has been 1000 (10%) since initialization; it is
// owner-settable with no event, so it is read per-call.
//
// Fees are paid in native BOT. The bare gas token (bot:0x0000...0000) has no
// price feed, so balances are denominated in WBOT, which is priced (~1:1 by
// construction). Same convention as dexlaunch's wnative usage on this chain.
const fetch: FetchV2 = async (options: FetchOptions) => {
  const WBOT = ADDRESSES.bot.WBOT;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();

  // flatten: false keeps each coordinator's logs in COORDINATORS order, so
  // requests() and protocolFeeBps() are read on the contract that emitted them.
  const [fulfillBatches, resolvedBatches] = await Promise.all([
    options.getLogs({ targets: COORDINATORS, eventAbi: RequestFulfilledEvent, flatten: false }),
    options.getLogs({ targets: COORDINATORS, eventAbi: ChallengeResolvedEvent, flatten: false }),
  ]);

  // Skip contract calls when a coordinator has no events: early hourly slots
  // can predate its deployment, where calls would revert.
  const requestCalls: { target: string; params: any[] }[] = [];
  const bpsTargets: string[] = [];
  fulfillBatches.forEach((logs: any[], i: number) => {
    if (!logs?.length) return;
    bpsTargets.push(COORDINATORS[i]);
    for (const log of logs) requestCalls.push({ target: COORDINATORS[i], params: [log.requestId] });
  });

  const [reqs, bpsList] = await Promise.all([
    requestCalls.length ? options.api.multiCall({ abi: RequestsAbi, calls: requestCalls }) : [],
    bpsTargets.length
      ? options.api.multiCall({ abi: "function protocolFeeBps() view returns (uint16)", calls: bpsTargets })
      : [],
  ]);

  const bpsByTarget: Record<string, bigint> = {};
  bpsTargets.forEach((target, i) => { bpsByTarget[target] = BigInt(bpsList[i]); });

  requestCalls.forEach((call, i) => {
    const fee = BigInt(reqs[i].fee);
    const cut = (fee * bpsByTarget[call.target]) / 10_000n;
    dailyFees.add(WBOT, fee, "Inference Fees");
    dailyUserFees.add(WBOT, fee, "Inference Fees");
    dailySupplySideRevenue.add(WBOT, fee - cut, "Inference Fees To Operators");
    dailyRevenue.add(WBOT, cut, "Inference Fees To Treasury");
  });

  const forfeitures: { target: string; requestId: string }[] = [];
  resolvedBatches.forEach((logs: any[], i: number) => {
    for (const log of logs ?? []) {
      if (log.challengerWins) continue;
      forfeitures.push({ target: COORDINATORS[i], requestId: log.requestId.toString() });
    }
  });

  if (forfeitures.length) {
    const challengedBatches = await options.getLogs({
      targets: COORDINATORS,
      eventAbi: ChallengedEvent,
      fromBlock: CHALLENGED_FROM_BLOCK,
      flatten: false,
      cacheInCloud: true,
    });
    const bondByKey: Record<string, bigint> = {};
    challengedBatches.forEach((logs: any[], i: number) => {
      for (const log of logs ?? []) bondByKey[`${COORDINATORS[i]}:${log.requestId.toString()}`] = BigInt(log.bond);
    });

    const missingTargets = [...new Set(
      forfeitures.filter((f) => bondByKey[`${f.target}:${f.requestId}`] === undefined).map((f) => f.target),
    )];
    const fallbackBonds = missingTargets.length
      ? await options.api.multiCall({ abi: "function challengeBond() view returns (uint256)", calls: missingTargets })
      : [];
    const fallbackByTarget: Record<string, bigint> = {};
    missingTargets.forEach((target, i) => { fallbackByTarget[target] = BigInt(fallbackBonds[i]); });

    for (const forfeiture of forfeitures) {
      const bond = bondByKey[`${forfeiture.target}:${forfeiture.requestId}`] ?? fallbackByTarget[forfeiture.target];
      dailyFees.add(WBOT, bond, "Dispute Bond Forfeitures");
      dailyRevenue.add(WBOT, bond, "Dispute Bond Forfeitures");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyUserFees,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "BOT paid by consumers to request AI inference, plus forfeited dispute bonds. Inference fees are counted when a request is fulfilled - timed-out requests refund in full, so escrowed-only requests are excluded.",
  Revenue: "The protocol's share (protocolFeeBps, currently 10%) of each fulfilled inference fee, plus forfeited challenge bonds, accrued to the treasury.",
  SupplySideRevenue: "The operator's share of each fulfilled inference fee, paid on fulfillment.",
  UserFees: "BOT paid by consumers to request AI inference.",
  ProtocolRevenue: "The treasury share of each fulfilled inference fee plus forfeited dispute bonds.",
};

const breakdownMethodology = {
  Fees: {
    "Inference Fees": "BOT escrowed by consumers and earned by the protocol on request fulfillment.",
    "Dispute Bond Forfeitures": "Bonds forfeited by challengers whose disputes were resolved in the protocol's favor.",
  },
  Revenue: {
    "Inference Fees To Treasury": "Protocol share (protocolFeeBps) of each fulfilled fee, accruing to the treasury.",
    "Dispute Bond Forfeitures": "Bonds forfeited by losing challengers, accruing to the treasury.",
  },
  SupplySideRevenue: {
    "Inference Fees To Operators": "Operator payout (fee minus protocol cut) for each fulfilled request.",
  },
  UserFees: {
    "Inference Fees": "BOT escrowed by consumers and earned by the protocol on request fulfillment.",
  },
  ProtocolRevenue: {
    "Inference Fees To Treasury": "Protocol share (protocolFeeBps) of each fulfilled fee, accruing to the treasury.",
    "Dispute Bond Forfeitures": "Bonds forfeited by losing challengers, accruing to the treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BOT_CHAIN],
  start: "2026-10-05", // first fulfilled request on mainnet (v1 block 25647520)
  methodology,
  breakdownMethodology,
};

export default adapter;
