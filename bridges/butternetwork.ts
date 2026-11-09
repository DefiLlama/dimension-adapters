import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { evmToTronAddress } from "@defillama/sdk/build/generalUtil";
import { ethers } from "ethers";

// Butter Network MOS v3 (MAP Protocol OmniService), same address on every EVM chain:
// https://etherscan.io/address/0x0000317Bec33Af037b5fAb2028f52d14658F6A56 (proxy, implementation `Bridge`).
// A transfer leaves the source chain with MessageOut and is delivered on the destination chain with MessageIn,
// routed through the MAP relay chain, which is not listed. MessageOut's payload is
// abi.encode(header, mos, token, amount, initiator, sender, to, swapData) with the source chain's token and
// amount; MessageIn carries the destination chain's token and amount (zero address for the gas token).
// The old adapter counted every token transfer in and out of the MOS, which counts each swap routed through it twice.
const MOS = "0x0000317Bec33Af037b5fAb2028f52d14658F6A56";
const TRON_MOS = "TXsDYB9ovFEFg4cja6gn1t1tpmrnSbYhHA";
const MESSAGE_OUT = "event MessageOut(bytes32 indexed orderId, uint256 indexed chainAndGasLimit, bytes payload)";
const MESSAGE_IN = "event MessageIn(bytes32 indexed orderId, uint256 indexed chainAndGasLimit, address token, uint256 amount, address to, bytes from, bytes payload, bool result, bytes reason)";
const PAYLOAD = ["uint256", "address", "address", "uint256", "address", "address", "bytes", "bytes"];

// MessageType in IMOSV3.sol: CALLDATA, MESSAGE, GENERAL, BRIDGE, DEPOSIT. Only BRIDGE is a user transfer;
// DEPOSIT adds liquidity on the relay chain. The type is the header's low byte (EvmDecoder.encodeMessageHeader).
const BRIDGE = 3n;

// chains with no MOS activity end on the day after their last volume in the old bridges API
const chainConfig: Record<string, { deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: {},
  [CHAIN.BSC]: {},
  [CHAIN.POLYGON]: {},
  [CHAIN.ARBITRUM]: {},
  [CHAIN.BASE]: {},
  [CHAIN.XLAYER]: {},
  [CHAIN.TRON]: {},
  [CHAIN.OPTIMISM]: { deadFrom: "2025-12-02" }, // no MOS events since
  [CHAIN.KLAYTN]: { deadFrom: "2026-03-09" }, // no MOS events since
  [CHAIN.LINEA]: { deadFrom: "2026-02-10" }, // no MOS events since
};

const coder = ethers.AbiCoder.defaultAbiCoder();

type Leg = { token: string; amount: bigint };

// outgoing BRIDGE messages and incoming deliveries; failed deliveries (result false) are stored for a retry and skipped
function parseLegs(outPayloads: string[], ins: { token: string; amount: bigint; result: boolean }[]) {
  const outgoing: Leg[] = [];
  for (const payload of outPayloads) {
    const [header, , token, amount] = coder.decode(PAYLOAD, payload);
    if ((BigInt(header) & 0xffn) !== BRIDGE) continue;
    outgoing.push({ token: String(token), amount: BigInt(amount) });
  }
  const incoming: Leg[] = ins.filter((e) => e.result).map((e) => ({ token: String(e.token), amount: BigInt(e.amount) }));
  return { outgoing, incoming };
}

function toResult(options: FetchOptions, outgoing: Leg[], incoming: Leg[], mapToken = (t: string) => t) {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  for (const leg of outgoing) dailyOutgoingVolume.add(mapToken(leg.token), leg.amount);
  for (const leg of incoming) dailyIncomingVolume.add(mapToken(leg.token), leg.amount);
  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: outgoing.length, dailyIncomingTxCount: incoming.length };
}

const fetchEvm = async (options: FetchOptions) => {
  const outs = await options.getLogs({ target: MOS, eventAbi: MESSAGE_OUT });
  const ins = await options.getLogs({ target: MOS, eventAbi: MESSAGE_IN });
  const { outgoing, incoming } = parseLegs(outs.map((l: any) => l.payload), ins);
  return toResult(options, outgoing, incoming);
};

const fetchTron = async (options: FetchOptions) => {
  const iface = new ethers.Interface([MESSAGE_OUT, MESSAGE_IN]);
  const outTopic = iface.getEvent("MessageOut")!.topicHash;
  const inTopic = iface.getEvent("MessageIn")!.topicHash;
  const rows: { topic0: string; topic1: string | null; topic2: string | null; topic3: string | null; data: string }[] = await queryAllium(`
    select topic0, topic1, topic2, topic3, data
    from tron.raw.logs
    where block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      and address = '${TRON_MOS}'
      and topic0 in ('${outTopic}', '${inTopic}')
  `);

  const outPayloads: string[] = [];
  const ins: { token: string; amount: bigint; result: boolean }[] = [];
  for (const row of rows) {
    const parsed = iface.parseLog({ topics: [row.topic0, row.topic1, row.topic2, row.topic3].filter(Boolean) as string[], data: row.data });
    if (!parsed) continue;
    if (parsed.name === "MessageOut") outPayloads.push(parsed.args.payload);
    else ins.push({ token: parsed.args.token, amount: parsed.args.amount, result: parsed.args.result });
  }
  const { outgoing, incoming } = parseLegs(outPayloads, ins);
  // token addresses are EVM-format hex; tron prices are keyed by base58, the zero address stays the gas token
  const tronToken = (token: string) => /^0x0{40}$/i.test(token) ? token : evmToTronAddress(token);
  return toResult(options, outgoing, incoming, tronToken);
};

const fetch = (options: FetchOptions) => options.chain === CHAIN.TRON ? fetchTron(options) : fetchEvm(options);

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    OutgoingVolume: "Value of tokens sent through the Butter Network MOS contract from each chain.",
    IncomingVolume: "Value of tokens delivered to recipients by the Butter Network MOS contract on each chain.",
    OutgoingTxCount: "Number of Butter Network bridge transfers sent from each chain.",
    IncomingTxCount: "Number of Butter Network bridge transfers delivered on each chain.",
  },
};

export default adapter;
