import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { DUNE_DEX_BLACKLIST_TABLE, getDexTokensBlacklisted } from "../../helpers/lists";

// Uniswap Trading API volume (https://developers.uniswap.org/docs/trading/overview), two legs:
//  1. UniswapX orders: Fill logs on the reactors, valued from the swapper -> filler input transfer in the fill tx.
//  2. Pool routes: every tx built by the API carries the calldata tag 0x756e69780000 ("unix" + ms timestamp), also
//     when wrapped by MetaMask's router or ERC-4337 bundlers. Matched on Dune and joined to dex.trades (uniswap),
//     valued at the user's sold token with intermediate hops dropped. Tag first seen 2025-10-21.
// Fill txs never carry the tag (0 of 2281 Ethereum fills on 2026-10-07), so the legs do not overlap.
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

const prefetch = async (options: FetchOptions) => {
  if (options.dateString < TAG_START) return [];
  const chains = Object.values(chainConfig).map(({ dune }) => dune);
  const tagged = chains
    .map((dune) => `SELECT '${dune}' AS blockchain, hash FROM ${dune}.transactions WHERE TIME_RANGE AND success AND bytearray_position(data, 0x756e69780000) > 0`)
    .join("\n      UNION ALL ");
  const bundles = chains
    .map((dune) => `SELECT '${dune}' AS blockchain, tx_hash FROM ${dune}.logs WHERE TIME_RANGE AND topic0 = ${USER_OPERATION_EVENT_TOPIC} GROUP BY 1, 2 HAVING COUNT(*) > 1`)
    .join("\n      UNION ALL ");
  // legs: dex.trades rows of tagged txs, minus blacklisted tokens and minus ERC-4337 bundles carrying several user
  // operations (other users' swaps cannot be told apart from the tagged one; ~2% of Base volume, ~0 elsewhere).
  // A leg is an intermediate hop when the earlier legs of the same tx already bought at least its sold amount of
  // that token (running balance in event order), which handles multi-hop, split and cyclic routes. ponytail: two
  // independent swaps sharing a token inside one tx would merge; the API builds one swap per tx.
  const sql = `
    WITH tagged AS (
      ${tagged}
    ),
    bundles AS (
      ${bundles}
    ),
    legs AS (
      SELECT t.blockchain, t.tx_hash, t.evt_index, t.token_sold_address, t.token_bought_address,
        CAST(t.token_sold_amount_raw AS DOUBLE) AS sold, CAST(t.token_bought_amount_raw AS DOUBLE) AS bought, t.amount_usd
      FROM dex.trades t
      JOIN tagged g ON g.blockchain = t.blockchain AND g.hash = t.tx_hash
      LEFT JOIN bundles m ON m.blockchain = t.blockchain AND m.tx_hash = t.tx_hash
      LEFT JOIN ${DUNE_DEX_BLACKLIST_TABLE} b0 ON b0.address = t.token_bought_address AND b0.chain IN ('any', t.blockchain)
      LEFT JOIN ${DUNE_DEX_BLACKLIST_TABLE} b1 ON b1.address = t.token_sold_address AND b1.chain IN ('any', t.blockchain)
      WHERE TIME_RANGE AND t.project = 'uniswap' AND m.tx_hash IS NULL AND b0.address IS NULL AND b1.address IS NULL
    ),
    flows AS (
      SELECT blockchain, tx_hash, evt_index, token_sold_address AS token, -sold AS delta FROM legs
      UNION ALL
      SELECT blockchain, tx_hash, evt_index, token_bought_address, bought FROM legs
    ),
    held AS (
      SELECT blockchain, tx_hash, evt_index, token, delta,
        SUM(delta) OVER (PARTITION BY blockchain, tx_hash, token ORDER BY evt_index RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
      FROM flows
    )
    SELECT l.blockchain, SUM(l.amount_usd) AS volume_usd
    FROM legs l
    JOIN held h ON h.blockchain = l.blockchain AND h.tx_hash = l.tx_hash AND h.evt_index = l.evt_index AND h.token = l.token_sold_address AND h.delta < 0
    WHERE COALESCE(h.before, 0) < l.sold * (1 - 1e-9)
    GROUP BY 1
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

const addUniswapXFills = async (options: FetchOptions, targets: string[], dailyVolume: any) => {
  const fills = await options.getLogs({ targets, eventAbi: FILL, entireLog: true, parseLog: true });
  if (!fills.length) return;
  const blacklisted = new Set(await getDexTokensBlacklisted(options));

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

  if (options.dateString >= TAG_START) {
    const row = (options.preFetchedResults || []).find((r: any) => r.blockchain === dune);
    if (!row || row.volume_usd == null) throw new Error(`Uniswap Aggregator: no tagged swaps on Dune for ${options.chain} ${options.dateString}`);
    dailyVolume.addUSDValue(row.volume_usd);
  }

  if (reactors) await addUniswapXFills(options, reactors, dailyVolume);

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
