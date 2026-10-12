import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";

// LayerZero OFT transfers, every OFT app included. USDT0, Stargate and the Citrea token bridges also have their own listings,
// which are marked doublecounted, as the old LayerZero feed counted them too.
// EVM chains: every OFT and OFT adapter emits OFTSent when tokens leave a chain and OFTReceived when they arrive, so both
// legs are read straight from those events by topic0 (thousands of OFT contracts, too many to list as targets). The
// emitter's token() gives the asset: an OFT returns itself, an OFT adapter (lockbox) the token it escrows, a native OFT
// adapter the zero address. Amounts are in the token's local decimals (amountSentLD / amountReceivedLD).
// Tron and Sei: the same events from Allium's raw logs (SDK getLogs can't scan tron by topic and is disabled for sei).
// Solana and Aptos: LayerZero OFT sends and receipts from Allium's crosschain.bridges.transfers, priced from the token and
// raw amount (Aptos only has outbound rows there).
const NATIVE = "0x0000000000000000000000000000000000000000";
// RPCs that cap eth_getLogs ranges: etherlink rejects more than 500 blocks
const MAX_BLOCK_RANGE: Record<string, number> = { [CHAIN.ETHERLINK]: 480 };
const ALLIUM_CHAINS: Record<string, string> = { [CHAIN.SOLANA]: "solana", [CHAIN.APTOS]: "aptos" };
// raw log table and its EVM-format emitter column
const RAW_LOG_CHAINS: Record<string, { table: string; address: string }> = {
  [CHAIN.TRON]: { table: "tron.raw.logs", address: "address_evm" },
  [CHAIN.SEI]: { table: "sei.raw.logs", address: "address" },
};
const OFT_SENT = "event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)";
const OFT_RECEIVED = "event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)";

type OftTransfer = { oapp: string; amount: string };

// emitter -> token() (an OFT returns itself, an OFT adapter its escrowed token, a native OFT adapter the zero address), then sum
const addOftTransfers = async (options: FetchOptions, sent: OftTransfer[], received: OftTransfer[]) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const oapps = [...new Set([...sent, ...received].map((t) => t.oapp))];
  // permitFailure: an OFT built without the IOFT token() getter is its own token, so a failed call falls back to the emitter.
  // tron serves no historical state, so token() (fixed at deployment) is read at the latest block there
  const api = options.chain === CHAIN.TRON ? new sdk.ChainApi({ chain: options.chain }) : options.api;
  const tokens: (string | null)[] = await api.multiCall({ abi: "address:token", calls: oapps, permitFailure: true });
  const tokenOf: Record<string, string> = {};
  // tron returns base58 token addresses, which are case-sensitive; only hex addresses are lowercased
  oapps.forEach((oapp, i) => { const token = tokens[i] ? String(tokens[i]) : oapp; tokenOf[oapp] = token.startsWith("0x") ? token.toLowerCase() : token; });

  for (const t of sent) dailyOutgoingVolume.add(tokenOf[t.oapp] ?? NATIVE, t.amount);
  for (const t of received) dailyIncomingVolume.add(tokenOf[t.oapp] ?? NATIVE, t.amount);
  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: sent.length, dailyIncomingTxCount: received.length };
};

const fetchEvm = async (options: FetchOptions) => {
  const getOftLogs = async (eventAbi: string, amountArg: string): Promise<OftTransfer[]> =>
    (await options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true, maxBlockRange: MAX_BLOCK_RANGE[options.chain] }))
      .map((log: any) => ({ oapp: log.address.toLowerCase(), amount: log.args[amountArg] }));
  return addOftTransfers(options, await getOftLogs(OFT_SENT, "amountSentLD"), await getOftLogs(OFT_RECEIVED, "amountReceivedLD"));
};

const fetchRawLogs = async (options: FetchOptions) => {
  const { table, address } = RAW_LOG_CHAINS[options.chain];
  const sentTopic = ethers.id("OFTSent(bytes32,uint32,address,uint256,uint256)");
  const receivedTopic = ethers.id("OFTReceived(bytes32,uint32,address,uint256)");
  const rows: { emitter: string; topic0: string; data: string }[] = await queryAllium(`
    select lower(${address}) as emitter, topic0, data
    from ${table}
    where block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      and topic0 in ('${sentTopic}', '${receivedTopic}')
  `);
  // the amount is the second data word in both events (OFTSent: dstEid, amountSentLD, amountReceivedLD; OFTReceived: srcEid, amountReceivedLD)
  const toTransfer = (row: { emitter: string; data: string }): OftTransfer => ({ oapp: row.emitter, amount: BigInt("0x" + row.data.replace(/^0x/, "").slice(64, 128)).toString() });
  return addOftTransfers(options, rows.filter((r) => r.topic0 === sentTopic).map(toTransfer), rows.filter((r) => r.topic0 === receivedTopic).map(toTransfer));
};

const fetchAllium = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const rows: { direction: string; token: string; amount: string; txs: number }[] = await queryAllium(`
    select direction, token_in_address as token, sum(try_cast(token_in_amount_raw as numeric(38, 0)))::varchar as amount, count(*) as txs
    from crosschain.bridges.transfers
    where protocol = 'layerzero' and chain = '${ALLIUM_CHAINS[options.chain]}'
      and block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      and block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      and token_in_address is not null
    group by direction, token_in_address
  `);
  // Solana has LayerZero transfers every hour, so no rows means the table has not caught up; Aptos is sparse enough to be empty
  if (!rows.length && options.chain === CHAIN.SOLANA) throw new Error(`layerzero: Allium returned no Solana rows for ${options.startTimestamp}, table not caught up`);

  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;
  for (const row of rows) {
    if (row.direction === "outbound") {
      dailyOutgoingVolume.add(row.token, row.amount);
      dailyOutgoingTxCount += Number(row.txs);
    } else if (row.direction === "inbound") {
      dailyIncomingVolume.add(row.token, row.amount);
      dailyIncomingTxCount += Number(row.txs);
    }
  }
  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const fetch = (options: FetchOptions) => {
  if (ALLIUM_CHAINS[options.chain]) return fetchAllium(options);
  if (RAW_LOG_CHAINS[options.chain]) return fetchRawLogs(options);
  return fetchEvm(options);
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    // served by the DefiLlama log indexer
    CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.OPTIMISM, CHAIN.BSC, CHAIN.POLYGON, CHAIN.AVAX, CHAIN.LINEA, CHAIN.SCROLL, CHAIN.BLAST,
    CHAIN.MODE, CHAIN.BERACHAIN, CHAIN.MONAD, CHAIN.MEGAETH, CHAIN.SONEIUM, CHAIN.SONIC, CHAIN.UNICHAIN, CHAIN.XLAYER,
    // topic-only getLogs through the chain's RPC
    CHAIN.PLASMA, CHAIN.MANTLE, CHAIN.HYPERLIQUID, CHAIN.ABSTRACT, CHAIN.INK, CHAIN.FLARE, CHAIN.KATANA, CHAIN.APECHAIN, CHAIN.ERA,
    CHAIN.CELO, CHAIN.CORE, CHAIN.FANTOM, CHAIN.FRAXTAL, CHAIN.HEDERA, CHAIN.HEMI, CHAIN.KLAYTN, CHAIN.LENS, CHAIN.LISK, CHAIN.MERLIN,
    CHAIN.PLUME, CHAIN.REYA, CHAIN.SOPHON, CHAIN.STORY, CHAIN.SWELLCHAIN, CHAIN.TAIKO, CHAIN.WC, CHAIN.XDC,
    CHAIN.ZIRCUIT, CHAIN.ZKLINK, CHAIN.AURORA, CHAIN.BITLAYER, CHAIN.BOB, CHAIN.CAMP, CHAIN.CRONOS_ZKEVM,
    CHAIN.XDAI, CHAIN.METIS, CHAIN.MANTA, CHAIN.KAVA, CHAIN.MOONBEAM, CHAIN.MOONRIVER, CHAIN.MORPH, CHAIN.OP_BNB, CHAIN.ZORA,
    CHAIN.ARBITRUM_NOVA, CHAIN.ASTAR, CHAIN.ASTAR_ZKEVM, CHAIN.CANTO, CHAIN.CONFLUX, CHAIN.CRONOS, CHAIN.FLOW, CHAIN.FUSE,
    CHAIN.GOAT, CHAIN.GRAVITY, CHAIN.EON, CHAIN.IOTAEVM, CHAIN.VANA, CHAIN.LIGHTLINK_PHOENIX, CHAIN.BEAM,
    CHAIN.PEAQ, CHAIN.REAL, CHAIN.ROBINHOOD, CHAIN.SOMNIA, CHAIN.TAC, CHAIN.TELOS, CHAIN.TOMOCHAIN, CHAIN.ARC, CHAIN.ETHERLINK,
    // from Allium
    CHAIN.SOLANA, CHAIN.APTOS,
    // from Allium raw logs
    CHAIN.TRON, CHAIN.SEI,
    // botanix, cyber, xai, zkPolygon, loot, pgn, tenet, xpla, ebi: no CHAIN key; injective, movement: non-EVM, not in Allium's LayerZero rows
  ],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    OutgoingVolume: "Value of LayerZero OFT tokens sent from each chain, including OFT apps such as USDT0 and Stargate.",
    IncomingVolume: "Value of LayerZero OFT tokens received on each chain, including OFT apps such as USDT0 and Stargate. Aptos has no incoming data.",
    OutgoingTxCount: "Number of LayerZero OFT sends from each chain.",
    IncomingTxCount: "Number of LayerZero OFT receipts on each chain.",
  },
};

export default adapter;
