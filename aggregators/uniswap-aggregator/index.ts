import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { DUNE_DEX_BLACKLIST_TABLE, getDefaultDexTokensBlacklisted, getDexTokensBlacklisted } from "../../helpers/lists";

// Uniswap Trading API volume (https://developers.uniswap.org/docs/trading/overview), two legs:
//  1. UniswapX orders: Fill logs on the reactors, valued from the swapper -> filler input transfer in the fill tx.
//  2. Pool routes: every tx built by the API carries the calldata tag 0x756e69780000 ("unix" + ms timestamp), also
//     when wrapped by MetaMask's router, EIP-7702 batches or ERC-4337 bundlers. Tagged txs are joined to Dune
//     dex.trades (project uniswap) and valued at the route's input token (see prefetch). Tag first seen 2025-10-21.
// Fill txs never carry the tag (0 of 2281 Ethereum fills on 2026-10-07), so the legs do not overlap.
// Tokens on the shared scam blacklist (helpers/lists.ts + Dune dataset) are skipped in both legs.
const FILL = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const USER_OPERATION_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f"; // ERC-4337 EntryPoint
const TAG_START = "2025-10-21";

// Reactors: https://github.com/Uniswap/sdks/blob/main/sdks/uniswapx-sdk/src/constants.ts (REACTOR_ADDRESS_MAPPING).
// RelayOrderReactor excluded (pays gas in tokens, the swap settles through the Universal Router); reactors with no
// fills (Optimism, Polygon, Worldchain, Soneium, Celo, Blast, Zora, Ink, Tempo, XLayer) left out.
// wnative = wrapped native token (helpers/coreAssets.json), so a route split across v4 native and v3 WETH pools is
// one input. start = first Fill, or first day with 10+ tagged txs where there is no reactor. Not listed: Arc (RPC
// returns no receipts, native USDC emits mirrored Transfer logs), Celo, Worldchain, Ink, zkSync (< $30k/day).
const chainConfig: Record<string, { start: string; dune: string; wnative: string; reactors?: string[] }> = {
  [CHAIN.ETHEREUM]: {
    start: "2023-07-27",
    dune: "ethereum",
    wnative: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    reactors: [
      "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4", // ExclusiveDutchOrderReactor
      "0x00000011F84B9aa48e5f8aA8B9897600006289Be", // V2DutchOrderReactor
      "0x0000000015757c461808EA25Eb309638B62681cf", // V3DutchOrderReactor
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-05-25",
    dune: "arbitrum",
    wnative: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    reactors: [
      "0x1bd1aAdc9E230626C44a139d7E70d842749351eb", // V2DutchOrderReactor
      "0xB274d5F4b833b61B340b654d600A864fB604a87c", // V3DutchOrderReactor
    ],
  },
  [CHAIN.BASE]: {
    start: "2024-08-14",
    dune: "base",
    wnative: "0x4200000000000000000000000000000000000006",
    reactors: [
      "0x000000001Ec5656dcdB24D90DFa42742738De729", // PriorityOrderReactor
      "0x000000008a8330B5d1F43A62Bf4C673A49f27ba0", // V3DutchOrderReactor
    ],
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-01-28",
    dune: "unichain",
    wnative: "0x4200000000000000000000000000000000000006",
    reactors: [
      "0x00000006021a6Bce796be7ba509bbba71e956e37", // PriorityOrderReactor
      "0x000000005aF66799D1a6317714D66800f9CA1406", // V3DutchOrderReactor
    ],
  },
  [CHAIN.BSC]: { start: "2025-10-21", dune: "bnb", wnative: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", reactors: ["0x00000000a55e50C71b70Db3C8B58749cd1E18eB2"] },
  [CHAIN.POLYGON]: { start: "2025-10-22", dune: "polygon", wnative: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270" },
  [CHAIN.OPTIMISM]: { start: "2025-10-31", dune: "optimism", wnative: "0x4200000000000000000000000000000000000006" },
  [CHAIN.AVAX]: { start: "2025-11-01", dune: "avalanche_c", wnative: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", reactors: ["0x00000000862cCF095823fc7576Fa6C7e6b7385ef"] },
  [CHAIN.MONAD]: { start: "2025-11-20", dune: "monad", wnative: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a", reactors: ["0x000000000Ac008F7e07210CFb6648e40249232c2"] },
  [CHAIN.ROBINHOOD]: { start: "2026-06-11", dune: "robinhood", wnative: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", reactors: ["0x000000007A1C8e570011EeDF86A2A35593013cBA"] },
};

// One query for every chain, one row per chain. For each tagged tx the Uniswap legs are read in event order with
// native folded into the wrapped token. A leg sells route proceeds (an intermediate hop) when earlier legs already
// bought at least its amount of that token; every other leg is user input. A swap has one input token, so the tx is
// valued at its largest input-token group: a token that leaves the route through a non-Uniswap conversion (Sky PSM,
// wrapping) and re-enters looks like a second, smaller input and is ignored. Multi-hop, split and cyclic routes all
// count once at the input. ERC-4337 bundles with several user operations are dropped (other users' swaps, ~2% of
// Base volume, ~0 elsewhere). ponytail: several API swaps batched in one tx count the largest only (~1% of tagged
// txs carry two tags).
const prefetch = async (options: FetchOptions) => {
  if (options.dateString < TAG_START) return [];
  const configs = Object.entries(chainConfig);
  const tagged = configs
    .map(([, { dune }]) => `SELECT '${dune}' AS blockchain, hash FROM ${dune}.transactions WHERE TIME_RANGE AND success AND bytearray_position(data, 0x756e69780000) > 0`)
    .join("\n      UNION ALL ");
  const bundles = configs
    .map(([, { dune }]) => `SELECT '${dune}' AS blockchain, tx_hash FROM ${dune}.logs WHERE TIME_RANGE AND topic0 = ${USER_OPERATION_EVENT_TOPIC} GROUP BY 1, 2 HAVING COUNT(*) > 1`)
    .join("\n      UNION ALL ");
  const wnative = configs.map(([, { dune, wnative }]) => `('${dune}', ${wnative})`).join(", ");
  const localBlacklist = configs
    .flatMap(([chain, { dune }]) => getDefaultDexTokensBlacklisted(chain).map((token) => `('${dune}', ${token})`))
    .join(", ");
  const sql = `
    WITH tagged AS (
      ${tagged}
    ),
    bundles AS (
      ${bundles}
    ),
    wnative (blockchain, token) AS (VALUES ${wnative}),
    blacklist (chain, address) AS (
      SELECT chain, address FROM ${DUNE_DEX_BLACKLIST_TABLE}
      UNION ALL SELECT * FROM (VALUES ${localBlacklist}) AS l (chain, address)
    ),
    legs AS (
      SELECT t.blockchain, t.tx_hash, t.evt_index,
        CASE WHEN t.token_sold_address = 0x0000000000000000000000000000000000000000 THEN w.token ELSE t.token_sold_address END AS sold,
        CASE WHEN t.token_bought_address = 0x0000000000000000000000000000000000000000 THEN w.token ELSE t.token_bought_address END AS bought,
        CAST(t.token_sold_amount_raw AS DOUBLE) AS sold_raw, CAST(t.token_bought_amount_raw AS DOUBLE) AS bought_raw,
        COALESCE(t.amount_usd, 0) AS usd
      FROM dex.trades t
      JOIN tagged g ON g.blockchain = t.blockchain AND g.hash = t.tx_hash
      JOIN wnative w ON w.blockchain = t.blockchain
      LEFT JOIN bundles m ON m.blockchain = t.blockchain AND m.tx_hash = t.tx_hash
      LEFT JOIN blacklist b0 ON b0.address = t.token_bought_address AND b0.chain IN ('any', t.blockchain)
      LEFT JOIN blacklist b1 ON b1.address = t.token_sold_address AND b1.chain IN ('any', t.blockchain)
      WHERE TIME_RANGE AND t.project = 'uniswap' AND m.tx_hash IS NULL AND b0.address IS NULL AND b1.address IS NULL
    ),
    flows AS (
      SELECT blockchain, tx_hash, evt_index, bought AS token, bought_raw AS delta, false AS is_sale FROM legs
      UNION ALL
      SELECT blockchain, tx_hash, evt_index, sold, 0, true FROM legs
    ),
    held AS (
      SELECT blockchain, tx_hash, evt_index, token, is_sale,
        SUM(delta) OVER (PARTITION BY blockchain, tx_hash, token ORDER BY evt_index RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
      FROM flows
    ),
    inputs AS (
      SELECT l.blockchain, l.tx_hash, l.sold AS token, SUM(l.usd) AS usd
      FROM legs l
      JOIN held h ON h.blockchain = l.blockchain AND h.tx_hash = l.tx_hash AND h.evt_index = l.evt_index AND h.token = l.sold AND h.is_sale
      WHERE COALESCE(h.before, 0) < l.sold_raw * (1 - 1e-9)
      GROUP BY 1, 2, 3
    ),
    per_tx AS (
      SELECT blockchain, tx_hash, MAX(usd) AS volume FROM inputs GROUP BY 1, 2
    )
    SELECT blockchain, SUM(volume) AS volume_usd FROM per_tx GROUP BY 1
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
