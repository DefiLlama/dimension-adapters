import * as http2 from "http2";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Per-request fees are only served by the network's gRPC service (protos: https://github.com/succinctlabs/network/tree/main/proto);
// the ledger settles on Ethereum through SuccinctVApp 0x5Ad5Bc4B18f7c173DcE17A57682Cb0Dc8788951F.
const SERVICE = "https://rpc.mainnet.succinct.xyz";
const PROVE = "0x6BEF15D938d4E72056AC92Ea4bDD0D76B1C4ad29";
const LOOKBACK = 24 * 3600; // longest request deadline seen since launch
const PAGE_SIZE = 100;
const MAX_ROWS = 10_000;

const PROXY_FUNDER = "0x76b9e359e8fb724eaba871d99a0b1baf4b07c8bc";
// Succinct's own accounts: requests they pay for are subsidies, not fees; provers they own earn protocol revenue
const NETWORK_ACCOUNTS = new Set([
  "0x9836d448ab5bae7932adcefb00f3e13a33d47e28", // SPN Auctioneer, from GetProofRequestParams
  "0x04226b4768ff1e0cc598c71569b9da916e60a601", // PROVE Seeder, funded the auctioneer
  "0xbab2c2af5b91695e65955da60d63ad1b2ae81126", // launch funder of the auctioneer, owner() of the "Succinct Labs 1" prover 0xd4fcfce0dee91a9895c3ad71a6248d57c287a4f5
  PROXY_FUNDER, // SPN Proxy Funder, funded by the auctioneer
  "0x0118029a04b007b08feac3e828c4d5f43123eb19", // SPN Requester, funded by the auctioneer
  "0xa4f539ae9d5791671bcd30f3f4bfe116a785310b", // funded the Proxy Funder
  "0x29cf94c0809bac6dfc837b5da92d0c7f088e7da1", // funded the Proxy Funder
  "0x5160dd063f2823585d62a0b3cbe9252d2400f1eb", // funded the SPN Requester
]);

// types.proto enums and field numbers
const FULFILLED = 3, DEPOSIT = 1, TRANSFER_IN = 5;
const REQUEST = { id: 1, gasPrice: 10, requester: 13, fulfiller: 14, fulfilledAt: 20, gasUsed: 27, baseFee: 34 };
const BALANCE_LOG_TX_HASH = 4;
const TX_SENDER = 2;

type Fields = [number, number | Buffer | undefined][];
type Message = Record<number, any[]>;

let session: http2.ClientHttp2Session | undefined;
let inFlight = 0;
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

function encode(fields: Fields) {
  const parts: Buffer[] = [];
  for (const [no, v] of fields) {
    if (v === undefined) continue;
    if (typeof v === "number") parts.push(varint(no << 3), varint(v));
    else parts.push(varint((no << 3) | 2), varint(v.length), v);
  }
  return Buffer.concat(parts);
}

function decode(buf: Buffer) {
  const out: Message = {};
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

function call(method: string, fields: Fields): Promise<Message> {
  return new Promise((resolve, reject) => {
    const body = encode(fields);
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
const bytes = (address: string) => Buffer.from(address.slice(2), "hex");

async function getAllPages(method: string, filter: Fields, limitField: number) {
  const rows: Buffer[] = [];
  for (let page = 1; page <= MAX_ROWS / PAGE_SIZE; page++) {
    const batch = (await call(method, [...filter, [limitField, PAGE_SIZE], [limitField + 1, page]]))[1] ?? [];
    if (!batch.length) return rows;
    rows.push(...batch);
  }
  throw new Error(`succinct ${method}: more than ${MAX_ROWS} rows`);
}

const senderCache = new Map<string, string>();
async function senderOf(txHash: Buffer) {
  const key = hex(txHash);
  if (!senderCache.has(key)) {
    const tx = (await call("GetTransactionDetails", [[1, txHash]]))[1][0];
    senderCache.set(key, hex(decode(tx)[TX_SENDER][0]));
  }
  return senderCache.get(key)!;
}

// newest first, stopping once the Proxy Funder shows up
async function requesterFunders(requester: string) {
  const senders = new Set<string>();
  for (let page = 1; page <= MAX_ROWS / PAGE_SIZE; page++) {
    const logs = (await call("GetFilteredBalanceLogs", [[1, bytes(requester)], [2, TRANSFER_IN], [5, PAGE_SIZE], [6, page]]))[1] ?? [];
    if (!logs.length) return senders;
    const { errors, results } = await PromisePool.withConcurrency(10).for(logs).process((log: Buffer) => senderOf(decode(log)[BALANCE_LOG_TX_HASH][0]));
    if (errors.length) throw errors[0];
    results.forEach((s) => senders.add(s));
    if (senders.has(PROXY_FUNDER)) return senders;
  }
  throw new Error(`succinct: more than ${MAX_ROWS} transfers into ${requester}`);
}

// paid with outside money: not a network account, never topped up by the Proxy Funder, and has a deposit or an outside funder
const outsideCache = new Map<string, boolean>();
async function isOutside(requester: string) {
  if (!outsideCache.has(requester)) {
    let outside = false;
    if (!NETWORK_ACCOUNTS.has(requester)) {
      const funders = await requesterFunders(requester);
      if (!funders.has(PROXY_FUNDER)) {
        const deposits = (await call("GetFilteredBalanceLogs", [[1, bytes(requester)], [2, DEPOSIT], [5, 1], [6, 1]]))[1] ?? [];
        outside = deposits.length > 0 || [...funders].some((f) => !NETWORK_ACCOUNTS.has(f));
      }
    }
    outsideCache.set(requester, outside);
  }
  return outsideCache.get(requester)!;
}

function requestField(request: Message, key: keyof typeof REQUEST) {
  const value = request[REQUEST[key]]?.[0];
  if (value === undefined) throw new Error(`succinct: fulfilled request ${hex(request[REQUEST.id][0])} has no ${key}`);
  return value;
}

const fetch = async ({ startTimestamp, endTimestamp, createBalances, api }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // the service filters by creation time, so also read earlier requests whose deadline reaches into the window
  const [createdBefore, createdInWindow] = await Promise.all([
    getAllPages("GetFilteredProofRequests", [[2, FULFILLED], [4, startTimestamp], [8, startTimestamp - LOOKBACK], [9, startTimestamp]], 10),
    getAllPages("GetFilteredProofRequests", [[2, FULFILLED], [8, startTimestamp], [9, endTimestamp]], 10),
  ]);

  const requests = new Map<string, { requester: string, prover: string, fee: bigint }>();
  for (const row of [...createdBefore, ...createdInWindow]) {
    const request = decode(row);
    const fulfilledAt = Number(requestField(request, "fulfilledAt"));
    if (fulfilledAt < startTimestamp || fulfilledAt >= endTimestamp) continue;
    requests.set(hex(request[REQUEST.id][0]), {
      requester: hex(request[REQUEST.requester][0]),
      prover: hex(requestField(request, "fulfiller")),
      fee: BigInt(requestField(request, "gasPrice")) * BigInt(requestField(request, "gasUsed")) + BigInt(requestField(request, "baseFee").toString()),
    });
  }

  const requesters = [...new Set([...requests.values()].map((r) => r.requester))];
  const outsideRequesters = new Set<string>();
  const { errors } = await PromisePool.withConcurrency(5).for(requesters).process(async (r) => { if (await isOutside(r)) outsideRequesters.add(r) });
  if (errors.length) throw errors[0];
  const counted = [...requests.values()].filter((r) => outsideRequesters.has(r.requester));

  const provers = [...new Set(counted.map((r) => r.prover))];
  const owners = await api.multiCall({ abi: "address:owner", calls: provers });
  const stakerFeeBips = await api.multiCall({ abi: "uint256:stakerFeeBips", calls: provers });
  const proverInfo = Object.fromEntries(provers.map((p, i) => [p, { succinctOwned: NETWORK_ACCOUNTS.has(owners[i].toLowerCase()), stakerFeeBips: BigInt(stakerFeeBips[i]) }]));

  for (const { prover, fee } of counted) {
    const { succinctOwned, stakerFeeBips } = proverInfo[prover];
    const stakerShare = fee * stakerFeeBips / 10000n;
    const operatorShare = fee - stakerShare;
    dailyFees.add(PROVE, fee, "Proof Fees");
    dailyRevenue.add(PROVE, stakerShare, "Proof Fees To PROVE Stakers");
    dailyHoldersRevenue.add(PROVE, stakerShare, "Proof Fees To PROVE Stakers");
    if (succinctOwned) {
      dailyRevenue.add(PROVE, operatorShare, "Proof Fees To Succinct Provers");
      dailyProtocolRevenue.add(PROVE, operatorShare, "Proof Fees To Succinct Provers");
    } else {
      dailySupplySideRevenue.add(PROVE, operatorShare, "Proof Fees To Prover Operators");
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-08-21",
  methodology: {
    Fees: "PROVE paid by requesters for fulfilled proof requests (price per prover gas unit times gas used, plus the base fee). Requests paid with PROVE from Succinct's own accounts (the auctioneer, its funders, the SPN Proxy Funder and SPN Requester, and requesters they fund) are excluded as subsidies.",
    Revenue: "The staker fee of the prover that fulfilled each request (set per prover at deployment, 10% on most), paid to PROVE holders staking on that prover, plus the rest of the fee on requests fulfilled by provers Succinct Labs runs.",
    ProtocolRevenue: "Proof fees less the staker fee on requests fulfilled by provers Succinct Labs runs. The protocol fee on proofs is zero, so no other proof fees go to Succinct.",
    HoldersRevenue: "The staker fee of the prover that fulfilled each request (set per prover at deployment, 10% on most), paid to PROVE holders staking on that prover.",
    SupplySideRevenue: "Proof fees less the staker fee on requests fulfilled by provers run by others, paid to their operators.",
  },
  breakdownMethodology: {
    Fees: {
      "Proof Fees": "PROVE paid by requesters outside Succinct's own accounts for fulfilled proof requests.",
    },
    Revenue: {
      "Proof Fees To PROVE Stakers": "Staker fee of the prover that fulfilled each request, paid to the PROVE staked on it.",
      "Proof Fees To Succinct Provers": "Proof fees less the staker fee on requests fulfilled by provers Succinct Labs runs.",
    },
    ProtocolRevenue: {
      "Proof Fees To Succinct Provers": "Proof fees less the staker fee on requests fulfilled by provers Succinct Labs runs.",
    },
    HoldersRevenue: {
      "Proof Fees To PROVE Stakers": "Staker fee of the prover that fulfilled each request, paid to the PROVE staked on it.",
    },
    SupplySideRevenue: {
      "Proof Fees To Prover Operators": "Proof fees less the staker fee on requests fulfilled by provers run by others, paid to their operators.",
    },
  },
};

export default adapter;
