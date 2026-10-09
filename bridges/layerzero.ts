import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { getBridgeContracts } from "../factory/evmBridges";

// LayerZero OFT transfers.
// EVM chains: every OFT and OFT adapter emits OFTSent when tokens leave a chain and OFTReceived when they arrive, so both
// legs are read straight from those events by topic0 (thousands of OFT contracts, too many to list as targets). The
// emitter's token() gives the asset: an OFT returns itself, an OFT adapter (lockbox) the token it escrows, a native OFT
// adapter the zero address. Amounts are in the token's local decimals (amountSentLD / amountReceivedLD).
// Solana and Aptos: LayerZero OFT sends and receipts from Allium's crosschain.bridges.transfers, priced from the token and
// raw amount (Aptos only has outbound rows there).
// USDT0, Stargate and the Citrea token bridges are OFTs with their own listings and are skipped (Stargate is a separate
// `bridge` value in Allium, USDT0 is not deployed on Solana or Aptos).
const OWN_LISTINGS = ["usdt0", "stargate", "citrea-token-bridges"];
const NATIVE = "0x0000000000000000000000000000000000000000";
const ALLIUM_CHAINS: Record<string, string> = { [CHAIN.SOLANA]: "solana", [CHAIN.APTOS]: "aptos" };

const fetchEvm = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const skip = new Set(OWN_LISTINGS.flatMap((slug) => getBridgeContracts(slug, options.chain)));

  const getOftLogs = (eventAbi: string) => options.getLogs({ eventAbi, noTarget: true, entireLog: true, parseLog: true });
  const sent = (await getOftLogs("event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)"))
    .filter((log: any) => !skip.has(log.address.toLowerCase()));
  const received = (await getOftLogs("event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)"))
    .filter((log: any) => !skip.has(log.address.toLowerCase()));

  const oapps = [...new Set([...sent, ...received].map((log: any) => log.address.toLowerCase()))];
  // permitFailure: an OFT built without the IOFT token() getter is its own token, so a failed call falls back to the emitter
  const tokens: (string | null)[] = await options.api.multiCall({ abi: "address:token", calls: oapps, permitFailure: true });
  const tokenOf: Record<string, string> = {};
  oapps.forEach((oapp, i) => { tokenOf[oapp] = tokens[i] ? String(tokens[i]).toLowerCase() : oapp; });

  for (const log of sent) dailyOutgoingVolume.add(tokenOf[log.address.toLowerCase()] ?? NATIVE, log.args.amountSentLD);
  for (const log of received) dailyIncomingVolume.add(tokenOf[log.address.toLowerCase()] ?? NATIVE, log.args.amountReceivedLD);

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: sent.length, dailyIncomingTxCount: received.length };
};

const fetchAllium = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const rows: { direction: string; token: string; amount: string; txs: number }[] = await queryAllium(`
    select direction, token_in_address as token, sum(try_cast(token_in_amount_raw as numeric(38, 0)))::varchar as amount, count(*) as txs
    from crosschain.bridges.transfers
    where protocol = 'layerzero' and bridge = 'layerzero' and chain = '${ALLIUM_CHAINS[options.chain]}'
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

const fetch = (options: FetchOptions) => (ALLIUM_CHAINS[options.chain] ? fetchAllium(options) : fetchEvm(options));

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
    CHAIN.NIBIRU, CHAIN.PLUME, CHAIN.REYA, CHAIN.SOPHON, CHAIN.STORY, CHAIN.SWELLCHAIN, CHAIN.TAIKO, CHAIN.WC, CHAIN.XDC,
    CHAIN.ZIRCUIT, CHAIN.ZKLINK, CHAIN.AURORA, CHAIN.BITLAYER, CHAIN.BOB, CHAIN.CAMP, CHAIN.CRONOS_ZKEVM,
    CHAIN.XDAI, CHAIN.METIS, CHAIN.MANTA, CHAIN.KAVA, CHAIN.MOONBEAM, CHAIN.MOONRIVER, CHAIN.MORPH, CHAIN.OP_BNB, CHAIN.ZORA,
    CHAIN.ARBITRUM_NOVA, CHAIN.ASTAR, CHAIN.ASTAR_ZKEVM, CHAIN.CANTO, CHAIN.CONFLUX, CHAIN.CRONOS, CHAIN.FLOW, CHAIN.FUSE,
    CHAIN.GOAT, CHAIN.GRAVITY, CHAIN.EON, CHAIN.IOTAEVM, CHAIN.VANA, CHAIN.LIGHTLINK_PHOENIX, CHAIN.BEAM, CHAIN.ORDERLY,
    CHAIN.PEAQ, CHAIN.REAL, CHAIN.ROBINHOOD, CHAIN.SOMNIA, CHAIN.TAC, CHAIN.TELOS, CHAIN.TOMOCHAIN, CHAIN.ARC,
    // from Allium
    CHAIN.SOLANA, CHAIN.APTOS,
    // polygon_zkevm: RPC frozen since 2026-07-03; sei: getLogs disabled in the SDK; rsk: no working getLogs RPC; harmony: inactive
    // bouncebit: RPC frozen; shimmer_evm, degen, rari, spn, corn, sanko: no RPC; okexchain: RPC errors
    // botanix, cyber, etherlink, xai, zkPolygon, loot, pgn, tenet, xpla, ebi: no CHAIN key; ton, tron, injective, movement: non-EVM, not in Allium's LayerZero rows
  ],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    OutgoingVolume: "Value of LayerZero OFT tokens sent from each chain, excluding USDT0, Stargate and the Citrea token bridges, which have their own listings.",
    IncomingVolume: "Value of LayerZero OFT tokens received on each chain, excluding USDT0, Stargate and the Citrea token bridges, which have their own listings. Aptos has no incoming data.",
    OutgoingTxCount: "Number of LayerZero OFT sends from each chain.",
    IncomingTxCount: "Number of LayerZero OFT receipts on each chain.",
  },
};

export default adapter;
