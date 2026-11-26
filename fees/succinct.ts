import * as http2 from "http2";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Succinct Prover Network. Requesters pay provers in PROVE for each fulfilled proof request; the ledger is settled
// on Ethereum by SuccinctVApp 0x5Ad5Bc4B18f7c173DcE17A57682Cb0Dc8788951F, but per-request fees are only in the
// network's own service (proto: https://github.com/succinctlabs/network/tree/main/proto). It answers gRPC over HTTP/2 only.
const PROVE = "0x6BEF15D938d4E72056AC92Ea4bDD0D76B1C4ad29";
const SERVICE = "https://rpc.mainnet.succinct.xyz";
const LOOKBACK = 24 * 3600; // longest request deadline (deadline - created_at) seen since launch; a longer one throws below
const PAGE_SIZE = 100; // documented maximum per page
const MAX_ROWS = 10_000; // the service refuses pages deeper than this
// Accounts the auctioneer has sent PROVE to, named by the service: SPN Proxy Funder and SPN Requester.
const PROXY_FUNDER = "0x76b9e359e8fb724eaba871d99a0b1baf4b07c8bc";
const SPN_REQUESTER = "0x0118029a04b007b08feac3e828c4d5f43123eb19";
const FULFILLED = 3, DEPOSIT = 1, TRANSFER_IN = 5; // types.proto FulfillmentStatus / BalanceOperation

let session: http2.ClientHttp2Session | undefined;
let inFlight = 0; // the connection holds the process open only while a call is running
function getSession() {
  if (!session || session.closed || session.destroyed) {
    const s = http2.connect(SERVICE);
    s.on("error", () => { if (session === s) session = undefined });
    s.on("goaway", () => { if (session === s) session = undefined });
    session = s;
  }
  return session;
}

function varint(n: number | bigint) {
  let v = BigInt(n);
  const out: number[] = [];
  do { let b = Number(v & 127n); v >>= 7n; if (v) b |= 128; out.push(b) } while (v);
  return Buffer.from(out);
}

// protobuf encoding of [field number, value] pairs: numbers as varints, buffers as length-delimited
function encode(fields: [number, number | Buffer | undefined][]) {
  const parts: Buffer[] = [];
  for (const [no, v] of fields) {
    if (v === undefined) continue;
    if (typeof v === "number") parts.push(varint(no << 3), varint(v));
    else parts.push(varint((no << 3) | 2), varint(v.length), v);
  }
  return Buffer.concat(parts);
}

function decode(buf: Buffer) {
  const out: Record<number, any[]> = {};
  let i = 0;
  const readVarint = () => { let r = 0n, s = 0n; for (;;) { const b = buf[i++]; r |= BigInt(b & 127) << s; s += 7n; if (!(b & 128)) return r } };
  while (i < buf.length) {
    const key = Number(readVarint()), wireType = key & 7;
    let v: any;
    if (wireType === 0) v = readVarint();
    else if (wireType === 2) { const len = Number(readVarint()); v = buf.subarray(i, i + len); i += len }
    else if (wireType === 1 || wireType === 5) { const len = wireType === 1 ? 8 : 4; v = buf.subarray(i, i + len); i += len }
    else throw new Error(`succinct: unknown protobuf wire type ${wireType}`);
    (out[key >> 3] ??= []).push(v);
  }
  return out;
}

function call(method: string, body: Buffer): Promise<Record<number, any[]>> {
  return new Promise((resolve, reject) => {
    const frame = Buffer.alloc(5);
    frame.writeUInt32BE(body.length, 1);
    const s = getSession();
    inFlight++;
    s.ref();
    const req = s.request({ ":method": "POST", ":path": `/network.ProverNetwork/${method}`, "content-type": "application/grpc", te: "trailers" });
    const chunks: Buffer[] = [];
    let status: any, message: any;
    req.setTimeout(60_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.on("response", (h) => { if (h["grpc-status"] !== undefined) { status = h["grpc-status"]; message = h["grpc-message"] } });
    req.on("trailers", (h) => { status = h["grpc-status"]; message = h["grpc-message"] });
    req.on("data", (c) => chunks.push(c));
    req.on("error", reject);
    req.on("close", () => {
      if (--inFlight === 0) session?.unref();
      if (status !== "0") return reject(new Error(`succinct ${method}: grpc-status ${status} ${message ?? ""}`));
      const data = Buffer.concat(chunks);
      if (data.length < 5 || data[0] !== 0 || data.length < 5 + data.readUInt32BE(1)) return reject(new Error(`succinct ${method}: bad response frame`));
      resolve(decode(data.subarray(5, 5 + data.readUInt32BE(1))));
    });
    req.end(Buffer.concat([frame, body]));
  });
}

const hex = (b: Buffer) => "0x" + b.toString("hex");
const bytes = (a: string) => Buffer.from(a.slice(2), "hex");

// All pages of a list call, until an empty page; throws past the service's depth limit instead of returning a cut list.
async function pages(method: string, fields: [number, number | Buffer | undefined][], limitField: number) {
  const rows: Buffer[] = [];
  for (let page = 1; ; page++) {
    if ((page - 1) * PAGE_SIZE > MAX_ROWS) throw new Error(`succinct ${method}: more than ${MAX_ROWS} rows`);
    const res = await call(method, encode([...fields, [limitField, PAGE_SIZE], [limitField + 1, page]]));
    const batch = res[1] ?? [];
    if (!batch.length) return rows;
    rows.push(...batch);
  }
}

const senderCache: Record<string, Promise<string>> = {};
const senderOf = (tx: Buffer) => senderCache[hex(tx)] ??= call("GetTransactionDetails", encode([[1, tx]])).then((r) => hex(decode(r[1][0])[2][0]));

// Senders of every TRANSFER_IN on an account's balance log (newest first), read in windows that stay under the depth limit.
async function transferSenders(address: string, stopAt?: string) {
  const senders = new Set<string>();
  const seen = new Set<string>();
  let maxTs: number | undefined;
  for (;;) {
    let page = 1, oldest = Infinity;
    for (; page <= MAX_ROWS / PAGE_SIZE; page++) {
      const res = await call("GetFilteredBalanceLogs", encode([[1, bytes(address)], [2, TRANSFER_IN], [4, maxTs], [5, PAGE_SIZE], [6, page]]));
      const logs = (res[1] ?? []).map(decode).filter((d) => !seen.has(hex(d[4][0])));
      if (!res[1]?.length) break;
      const { errors, results } = await PromisePool.withConcurrency(10).for(logs).process(async (d) => senderOf(d[4][0]));
      if (errors.length) throw errors[0];
      results.forEach((s) => senders.add(s));
      if (stopAt && senders.has(stopAt)) return senders;
      logs.forEach((d) => { seen.add(hex(d[4][0])); oldest = Math.min(oldest, Number(d[5][0])) });
    }
    if (page <= MAX_ROWS / PAGE_SIZE) return senders;
    if (oldest === Infinity) throw new Error(`succinct: cannot page the balance log of ${address}`);
    maxTs = oldest; // past the depth limit: continue from the oldest entry read
  }
}

// Network accounts: the auctioneer, the accounts that sent it PROVE, the two accounts it funds and the accounts that funded those.
let networkPromise: Promise<{ auctioneer: string, accounts: Set<string> }> | undefined;
const getNetwork = () => networkPromise ??= (async () => {
  const auctioneer = hex((await call("GetProofRequestParams", encode([])))[2][0]);
  const accounts = new Set([auctioneer, PROXY_FUNDER, SPN_REQUESTER]);
  for (const a of [auctioneer, PROXY_FUNDER, SPN_REQUESTER]) (await transferSenders(a)).forEach((s) => accounts.add(s));
  return { auctioneer, accounts };
})();

// A requester is outside the network unless it is a network account, was ever topped up by the Proxy Funder,
// or has no deposit and was only funded by network accounts.
const outsideCache: Record<string, Promise<boolean>> = {};
const isOutside = (requester: string, network: Set<string>) => outsideCache[requester] ??= (async () => {
  if (network.has(requester)) return false;
  const senders = await transferSenders(requester, PROXY_FUNDER);
  if (senders.has(PROXY_FUNDER)) return false;
  const deposits = (await call("GetFilteredBalanceLogs", encode([[1, bytes(requester)], [2, DEPOSIT], [5, 1], [6, 1]])))[1] ?? [];
  return deposits.length > 0 || [...senders].some((s) => !network.has(s));
})();

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances, api } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const { accounts } = await getNetwork();

  // requests are filtered by creation time, so also read those created up to LOOKBACK before the window whose
  // deadline reaches into it (minimum_deadline), and keep every request by its fulfillment time
  const hours: number[] = [];
  for (let t = startTimestamp - LOOKBACK; t < endTimestamp; t += 3600) hours.push(t);
  const { errors, results } = await PromisePool.withConcurrency(5).for(hours).process(async (from) =>
    pages("GetFilteredProofRequests", [[2, FULFILLED], [4, from < startTimestamp ? startTimestamp : undefined], [8, from], [9, Math.min(from + 3600, endTimestamp)]], 10));
  if (errors.length) throw errors[0];

  const requests: { requester: string, prover: string, fee: bigint }[] = [];
  for (const row of results.flat()) {
    const d = decode(row);
    if (d[8][0] - d[18][0] > BigInt(LOOKBACK)) throw new Error(`succinct: request ${hex(d[1][0])} has a deadline beyond the lookback`);
    if (d[20] === undefined || d[14] === undefined || d[10] === undefined || d[27] === undefined || d[34] === undefined) throw new Error(`succinct: fulfilled request ${hex(d[1][0])} lacks its fee fields`);
    const fulfilledAt = Number(d[20][0]);
    if (fulfilledAt < startTimestamp || fulfilledAt >= endTimestamp) continue;
    // fee charged by the vApp: price per prover gas unit * units used + base fee (crates/vapp/src/state.rs)
    requests.push({ requester: hex(d[13][0]), prover: hex(d[14][0]), fee: BigInt(d[10][0]) * BigInt(d[27][0]) + BigInt(d[34][0].toString()) });
  }

  const requesters = [...new Set(requests.map((r) => r.requester))];
  const counted = new Set<string>();
  const outside = await PromisePool.withConcurrency(5).for(requesters).process(async (r) => { if (await isOutside(r, accounts)) counted.add(r) });
  if (outside.errors.length) throw outside.errors[0];
  const kept = requests.filter((r) => counted.has(r.requester));

  // each prover is a SuccinctProver contract: its owner gets the fee less the immutable staker fee (fee.rs, protocol fee 0)
  const provers = [...new Set(kept.map((r) => r.prover))];
  const owners = await api.multiCall({ abi: "address:owner", calls: provers });
  const stakerBips = await api.multiCall({ abi: "uint256:stakerFeeBips", calls: provers });
  const proverInfo: Record<string, { networkOwned: boolean, bips: bigint }> = {};
  provers.forEach((p, i) => proverInfo[p] = { networkOwned: accounts.has(owners[i].toLowerCase()), bips: BigInt(stakerBips[i]) });

  for (const { prover, fee } of kept) {
    const { networkOwned, bips } = proverInfo[prover];
    const stakerShare = fee * bips / 10000n;
    dailyFees.add(PROVE, fee, "Proof Fees");
    if (networkOwned) {
      dailyRevenue.add(PROVE, fee - stakerShare, "Proof Fees To Succinct Provers");
      dailySupplySideRevenue.add(PROVE, stakerShare, "Proof Fees To Provers And Their Stakers");
    } else {
      dailySupplySideRevenue.add(PROVE, fee, "Proof Fees To Provers And Their Stakers");
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  // each request carries the second it was fulfilled
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-08-21", // first day an outside requester was fulfilled; the network has served requests since 2025-08-05
  methodology: {
    Fees: "PROVE paid by requesters outside the network for fulfilled proof requests: price per prover gas unit times units used, plus the base fee, counted when the request is fulfilled. Requests from the network's own accounts are left out: the auctioneer, the accounts that funded it, the SPN Proxy Funder and SPN Requester it funds and the accounts that funded those, every requester ever topped up by the Proxy Funder, and requesters with no deposit funded only by network accounts.",
    Revenue: "The owner's share (the fee less the prover's staker fee) of proof fees earned by provers whose owner is a network account. The network's protocol fee on proofs is zero, so there is no other proof-fee revenue; the auctioneer's withdrawal, delegation and transfer fees are not counted.",
    ProtocolRevenue: "The owner's share of proof fees earned by provers whose owner is a network account.",
    SupplySideRevenue: "All other proof fees: the owner's share of provers run by others, and the staker share of every prover, paid to the PROVE staked on it.",
  },
  breakdownMethodology: {
    Fees: {
      "Proof Fees": "PROVE paid by requesters outside the network for fulfilled proof requests.",
    },
    Revenue: {
      "Proof Fees To Succinct Provers": "Fee less the prover's staker fee, on requests fulfilled by provers whose owner is a network account.",
    },
    ProtocolRevenue: {
      "Proof Fees To Succinct Provers": "Fee less the prover's staker fee, on requests fulfilled by provers whose owner is a network account.",
    },
    SupplySideRevenue: {
      "Proof Fees To Provers And Their Stakers": "Whole fee on requests fulfilled by provers run by others, and the staker fee on requests fulfilled by network-owned provers.",
    },
  },
};

export default adapter;
