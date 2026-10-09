import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { getDexTokensBlacklisted } from "../../helpers/lists";

// Uniswap Trading API volume (https://developers.uniswap.org/docs/trading/overview), two legs:
//  1. UniswapX orders: Fill logs on the reactors, valued from the swapper -> filler input transfer in the fill tx.
//  2. Pool routes: every tx built by the API carries the calldata tag 0x756e69780000 ("unix" + ms timestamp), also
//     when wrapped by MetaMask's router, EIP-7702 batches or ERC-4337 bundlers. Each tagged tx that contains a
//     Uniswap pool swap is valued on Dune by the swapper's own net token outflows (native + ERC-20, refunds netted),
//     so intermediate hops, split routes and other users' swaps in the same tx never count. Tag first seen 2025-10-21.
// Fill txs never carry the tag (0 of 2281 Ethereum fills on 2026-10-07), so the legs do not overlap.
// Tokens on the shared scam blacklist (helpers/lists.ts) are skipped in both legs.
const FILL = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USER_OPERATION_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f"; // ERC-4337 EntryPoint
const TAG_START = "2025-10-21";

// Reactors: https://github.com/Uniswap/sdks/blob/main/sdks/uniswapx-sdk/src/constants.ts (REACTOR_ADDRESS_MAPPING).
// RelayOrderReactor excluded (pays gas in tokens, the swap settles through the Universal Router); reactors with no
// fills (Optimism, Polygon, Worldchain, Soneium, Celo, Blast, Zora, Ink, Tempo, XLayer) left out.
// start = first Fill, or first day with 10+ tagged txs where there is no reactor. Not listed: Arc (RPC returns no
// receipts, native USDC emits mirrored Transfer logs), Celo, Worldchain, Ink, zkSync (< $30k/day).
const chainConfig: Record<string, { start: string; dune: string; reactors?: string[] }> = {
  [CHAIN.ETHEREUM]: {
    start: "2023-07-27",
    dune: "ethereum",
    reactors: [
      "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4", // ExclusiveDutchOrderReactor
      "0x00000011F84B9aa48e5f8aA8B9897600006289Be", // V2DutchOrderReactor
      "0x0000000015757c461808EA25Eb309638B62681cf", // V3DutchOrderReactor
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-05-25",
    dune: "arbitrum",
    reactors: [
      "0x1bd1aAdc9E230626C44a139d7E70d842749351eb", // V2DutchOrderReactor
      "0xB274d5F4b833b61B340b654d600A864fB604a87c", // V3DutchOrderReactor
    ],
  },
  [CHAIN.BASE]: {
    start: "2024-08-14",
    dune: "base",
    reactors: [
      "0x000000001Ec5656dcdB24D90DFa42742738De729", // PriorityOrderReactor
      "0x000000008a8330B5d1F43A62Bf4C673A49f27ba0", // V3DutchOrderReactor
    ],
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-01-28",
    dune: "unichain",
    reactors: [
      "0x00000006021a6Bce796be7ba509bbba71e956e37", // PriorityOrderReactor
      "0x000000005aF66799D1a6317714D66800f9CA1406", // V3DutchOrderReactor
    ],
  },
  [CHAIN.BSC]: { start: "2025-10-21", dune: "bnb", reactors: ["0x00000000a55e50C71b70Db3C8B58749cd1E18eB2"] },
  [CHAIN.POLYGON]: { start: "2025-10-22", dune: "polygon" },
  [CHAIN.OPTIMISM]: { start: "2025-10-31", dune: "optimism" },
  [CHAIN.AVAX]: { start: "2025-11-01", dune: "avalanche_c", reactors: ["0x00000000862cCF095823fc7576Fa6C7e6b7385ef"] },
  [CHAIN.MONAD]: { start: "2025-11-20", dune: "monad", reactors: ["0x000000000Ac008F7e07210CFb6648e40249232c2"] },
  [CHAIN.ROBINHOOD]: { start: "2026-06-11", dune: "robinhood", reactors: ["0x000000007A1C8e570011EeDF86A2A35593013cBA"] },
};

// One query for every chain, returning (blockchain, token, amount) with the swapper's net outflow per token.
// swapper = tx sender, or the ERC-4337 UserOperation sender for single-operation bundles (multi-operation bundles are
// dropped: ~2% of Base volume, ~0 elsewhere). Only tokens named in the calldata (or the native token) count, and only
// txs with a Uniswap pool swap, which leaves out the API's wrap/unwrap transactions.
const prefetch = async (options: FetchOptions) => {
  if (options.dateString < TAG_START) return [];
  const chains = Object.values(chainConfig).map(({ dune }) => dune);
  const tagged = chains
    .map((dune) => `SELECT '${dune}' AS blockchain, hash, "from" AS tx_from, data FROM ${dune}.transactions WHERE TIME_RANGE AND success AND bytearray_position(data, 0x756e69780000) > 0`)
    .join("\n      UNION ALL ");
  const ops = chains
    .map((dune) => `SELECT '${dune}' AS blockchain, tx_hash, COUNT(*) AS n, arbitrary(bytearray_substring(topic2, 13, 20)) AS sender FROM ${dune}.logs WHERE TIME_RANGE AND topic0 = ${USER_OPERATION_EVENT_TOPIC} GROUP BY 1, 2`)
    .join("\n      UNION ALL ");
  const inList = chains.map((c) => `'${c}'`).join(", ");
  const sql = `
    WITH tagged AS (
      ${tagged}
    ),
    ops AS (
      ${ops}
    ),
    swaps AS (
      SELECT DISTINCT blockchain, tx_hash FROM dex.trades WHERE TIME_RANGE AND project = 'uniswap' AND blockchain IN (${inList})
    ),
    swappers AS (
      SELECT g.blockchain, g.hash, COALESCE(o.sender, g.tx_from) AS swapper, g.data
      FROM tagged g
      JOIN swaps s ON s.blockchain = g.blockchain AND s.tx_hash = g.hash
      LEFT JOIN ops o ON o.blockchain = g.blockchain AND o.tx_hash = g.hash
      WHERE COALESCE(o.n, 1) = 1
    ),
    per_tx AS (
      SELECT s.blockchain, s.hash,
        CASE WHEN t.token_standard = 'native' THEN 'native' ELSE CAST(t.contract_address AS VARCHAR) END AS token,
        SUM(CASE WHEN t."from" = s.swapper THEN 1 ELSE -1 END * CAST(t.amount_raw AS DOUBLE)) AS net
      FROM tokens.transfers t
      JOIN swappers s ON s.blockchain = t.blockchain AND s.hash = t.tx_hash AND (t."from" = s.swapper OR t."to" = s.swapper)
      WHERE TIME_RANGE AND t.blockchain IN (${inList})
        AND (t.token_standard = 'native' OR bytearray_position(s.data, t.contract_address) > 0)
      GROUP BY 1, 2, 3
    )
    SELECT blockchain, token, format('%.0f', SUM(net)) AS amount
    FROM per_tx WHERE net > 0
    GROUP BY 1, 2
  `;
  return queryDuneSql(options, sql);
};

const pairKey = (from: string, to: string) => `${from}:${to}`.toLowerCase();
const addressFromTopic = (topic: string) => `0x${topic.slice(-40)}`;

// Fallback RPCs return null (or throw) for receipts that exist; keep re-requesting the stragglers.
const getReceipts = async (chain: string, txHashes: string[]) => {
  const receipts = new Map<string, any>();
  let lastError: any;
  let missing = txHashes;
  for (let round = 0; round < 8 && missing.length; round++) {
    if (round) await new Promise((resolve) => setTimeout(resolve, 1000 * round));
    try {
      const fetched = await getTxReceiptsWithRetry(chain, missing);
      fetched.forEach((receipt, i) => { if (receipt) receipts.set(missing[i], receipt); });
    } catch (e) {
      lastError = (e as any)?.[0]?.message ?? e;
    }
    missing = txHashes.filter((hash) => !receipts.has(hash));
  }
  if (missing.length) throw new Error(`UniswapX: ${missing.length} fill receipts missing on ${chain} after 8 rounds (${missing[0]}): ${lastError ?? "null receipts"}`);
  return txHashes.map((hash) => receipts.get(hash));
};

const addUniswapXFills = async (options: FetchOptions, targets: string[], blacklisted: Set<string>, dailyVolume: any) => {
  const fills = await options.getLogs({ targets, eventAbi: FILL, entireLog: true, parseLog: true });
  if (!fills.length) return;

  const fillsByTx: Record<string, any[]> = {};
  for (const fill of fills) {
    const txHash = fill.transactionHash.toLowerCase();
    (fillsByTx[txHash] ??= []).push(fill.args);
  }

  const txHashes = Object.keys(fillsByTx);
  const receipts = await getReceipts(options.chain, txHashes);

  receipts.forEach((receipt, i) => {
    const txHash = txHashes[i];
    const transfersByPair: Record<string, any[]> = {};
    for (const log of receipt.logs) {
      if (log.topics.length !== 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC || log.data === "0x") continue;
      (transfersByPair[pairKey(addressFromTopic(log.topics[1]), addressFromTopic(log.topics[2]))] ??= []).push(log);
    }

    // one Fill per order, but a batch of orders from one swapper shares the (swapper, filler) input transfers
    const counted = new Set<string>();
    for (const { swapper, filler } of fillsByTx[txHash]) {
      const inputKey = pairKey(swapper, filler);
      if (counted.has(inputKey)) continue;
      counted.add(inputKey);

      // tokens without a standard Transfer on transferFrom (Privacy Inu on BSC) are valued from the output leg
      const legs = transfersByPair[inputKey] ?? transfersByPair[pairKey(filler, swapper)];
      if (!legs) {
        console.log(`UniswapX: no ERC-20 leg between ${swapper} and ${filler} in ${txHash} on ${options.chain}, skipping fill`);
        continue;
      }
      for (const log of legs) {
        if (blacklisted.has(log.address.toLowerCase())) continue;
        dailyVolume.add(log.address, BigInt(log.data));
      }
    }
  });
};

const fetch = async (options: FetchOptions) => {
  const { dune, reactors } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();
  const blacklisted = new Set(await getDexTokensBlacklisted(options));

  if (options.dateString >= TAG_START) {
    const rows = (options.preFetchedResults || []).filter((r: any) => r.blockchain === dune);
    if (!rows.length) throw new Error(`Uniswap Aggregator: no tagged swaps on Dune for ${options.chain} ${options.dateString}`);
    for (const { token, amount } of rows) {
      if (token === "native") dailyVolume.addGasToken(amount);
      else if (!blacklisted.has(token.toLowerCase())) dailyVolume.add(token, amount);
    }
  }

  if (reactors) await addUniswapXFills(options, reactors, blacklisted, dailyVolume);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Volume: "Swaps routed by Uniswap's Trading API, which picks the best route across Uniswap pools and UniswapX fillers. Each swap is counted once at the value of the tokens sold.",
  },
};

export default adapter;
