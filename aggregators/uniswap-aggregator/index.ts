import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { DUNE_DEX_BLACKLIST_TABLE, getDexTokensBlacklisted } from "../../helpers/lists";

// The Uniswap Trading API (https://developers.uniswap.org/docs/trading/overview) quotes Uniswap v2/v3/v4 pools and
// UniswapX fillers for every request and executes the best route. Its volume has two legs:
//  1. UniswapX orders: Fill logs on the reactors, valued from the swapper -> filler input transfer in the fill tx.
//  2. Pool ("classic") routes: every transaction built by the API carries the calldata tag 0x756e69780000 ("unix")
//     followed by a millisecond timestamp. The tag survives wrapping, so swaps submitted through MetaMask's router,
//     ERC-4337 bundlers or other wallet contracts are matched too. Those txs are joined to Dune dex.trades
//     (project = uniswap) and valued at the user's sold token, excluding intermediate hops. First tagged txs:
//     2025-10-21 on Ethereum, Base, Arbitrum, BNB and Unichain.
// Fill txs never carry the tag (0 of 2281 Ethereum fills on 2026-10-07), so the two legs do not overlap.
// Swaps touching a token in the shared scam/wash blacklist (helpers/lists.ts, Dune dataset + local list) are dropped
// from both legs.

// Every UniswapX reactor (Exclusive Dutch, Dutch V2, Dutch V3, Priority) emits the same Fill event, which carries
// no amounts. The order input is pulled by Permit2 from the swapper to the filler (reactor msg.sender) inside the
// fill tx, so each order is valued from that ERC-20 Transfer in the tx receipt.
const FILL = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TAG_START = "2025-10-21"; // first day the calldata tag appears at scale on any chain

// Reactor addresses: https://github.com/Uniswap/sdks/blob/main/sdks/uniswapx-sdk/src/constants.ts (REACTOR_ADDRESS_MAPPING)
// and https://github.com/Uniswap/UniswapX/blob/main/deployments.md
// The RelayOrderReactor (0x0000000000A4e21E2597DCac987455c48b12edBF) is excluded on purpose: relay orders only pay
// gas in tokens for a swap that settles through the Universal Router, so they are not swap volume.
// Reactors that have never filled an order (Optimism, Polygon V3, Worldchain, Soneium, Celo, Blast, Zora, Ink,
// Tempo, XLayer) and Polygon's Exclusive Dutch reactor (57 fills in total) are left out.
// start = first Fill on the chain, or the first day with 10+ tagged txs on chains without UniswapX fills.
// Chains with tagged swaps left out for now (2026-10-07): Arc (~$230k/day, RPC returns no receipts and native USDC
// emits mirrored Transfer logs), Celo, Worldchain, Ink, zkSync (< $30k/day each).
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
      "0x1bd1aAdc9E230626C44a139d7E70d842749351eb", // V2DutchOrderReactor (active 2024-05 to 2025-10)
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
  [CHAIN.BSC]: {
    start: "2025-10-21",
    dune: "bnb",
    reactors: ["0x00000000a55e50C71b70Db3C8B58749cd1E18eB2"], // V3DutchOrderReactor, first fill 2026-06-11
  },
  [CHAIN.POLYGON]: { start: "2025-10-22", dune: "polygon" },
  [CHAIN.OPTIMISM]: { start: "2025-10-31", dune: "optimism" },
  [CHAIN.AVAX]: {
    start: "2025-11-01",
    dune: "avalanche_c",
    reactors: ["0x00000000862cCF095823fc7576Fa6C7e6b7385ef"], // V3DutchOrderReactor, first fill 2026-06-29
  },
  [CHAIN.MONAD]: {
    start: "2025-11-20",
    dune: "monad",
    reactors: ["0x000000000Ac008F7e07210CFb6648e40249232c2"], // V3DutchOrderReactor, first fill 2026-09-11
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-06-11",
    dune: "robinhood",
    reactors: ["0x000000007A1C8e570011EeDF86A2A35593013cBA"], // V3DutchOrderReactor, first fill 2026-07-01
  },
};

// One query for every chain. A multi-hop route shows up as several dex.trades rows per tx; only the legs whose sold
// token was not bought earlier in the same tx are the user's input, so intermediate hops are dropped. Legs touching
// a blacklisted token are dropped before that, so a scam token cannot survive as the "input" of a route.
const prefetch = async (options: FetchOptions) => {
  if (options.dateString < TAG_START) return [];
  const tagged = Object.values(chainConfig)
    .map(({ dune }) => `SELECT '${dune}' AS blockchain, hash FROM ${dune}.transactions WHERE TIME_RANGE AND success AND bytearray_position(data, 0x756e69780000) > 0`)
    .join("\n      UNION ALL ");
  const sql = `
    WITH tagged AS (
      ${tagged}
    ),
    legs AS (
      SELECT t.blockchain, t.tx_hash, t.token_sold_address, t.token_bought_address, t.amount_usd
      FROM dex.trades t
      JOIN tagged g ON g.blockchain = t.blockchain AND g.hash = t.tx_hash
      LEFT JOIN ${DUNE_DEX_BLACKLIST_TABLE} b0 ON b0.address = t.token_bought_address AND b0.chain IN ('any', t.blockchain)
      LEFT JOIN ${DUNE_DEX_BLACKLIST_TABLE} b1 ON b1.address = t.token_sold_address AND b1.chain IN ('any', t.blockchain)
      WHERE TIME_RANGE AND t.project = 'uniswap' AND b0.address IS NULL AND b1.address IS NULL
    )
    SELECT a.blockchain, SUM(a.amount_usd) AS volume_usd, COUNT(*) AS legs
    FROM legs a
    WHERE NOT EXISTS (
      SELECT 1 FROM legs b
      WHERE b.blockchain = a.blockchain AND b.tx_hash = a.tx_hash AND b.token_bought_address = a.token_sold_address
    )
    GROUP BY 1
  `;
  return queryDuneSql(options, sql);
};

const pairKey = (from: string, to: string) => `${from}:${to}`.toLowerCase();
const addressFromTopic = (topic: string) => `0x${topic.slice(-40)}`;

// Fallback RPC sets mix pruned and archive nodes, so a receipt that exists comes back null on roughly one call in
// three (observed on Arbitrum for 2024 blocks). The helper retries 3 times; keep re-requesting the stragglers.
const getReceipts = async (chain: string, txHashes: string[]) => {
  const receipts = new Map<string, any>();
  for (let round = 0; round < 8; round++) {
    const missing = txHashes.filter((hash) => !receipts.has(hash));
    if (!missing.length) break;
    if (round) await new Promise((resolve) => setTimeout(resolve, 1000 * round));
    let fetched: any[];
    try {
      fetched = await getTxReceiptsWithRetry(chain, missing);
    } catch (e) {
      // the helper throws on any single RPC error in the batch; retry the batch, hashes still missing after the
      // last round throw below
      console.log(`UniswapX: receipt batch failed on ${chain} (round ${round + 1}): ${(e as any)?.[0]?.message ?? e}`);
      continue;
    }
    fetched.forEach((receipt, i) => { if (receipt) receipts.set(missing[i], receipt); });
  }
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
    if (!receipt) throw new Error(`UniswapX: missing receipt for fill tx ${txHash} on ${options.chain}`);

    // ERC-20 Transfer logs in the fill tx grouped by (from, to)
    const transfersByPair: Record<string, any[]> = {};
    for (const log of receipt.logs) {
      if (log.topics.length !== 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC || log.data === "0x") continue;
      (transfersByPair[pairKey(addressFromTopic(log.topics[1]), addressFromTopic(log.topics[2]))] ??= []).push(log);
    }

    // A filler batching several orders of one swapper emits one Fill per order but the inputs are matched per
    // (swapper, filler) pair, so each pair is counted once.
    const counted = new Set<string>();
    for (const { swapper, filler } of fillsByTx[txHash]) {
      const inputKey = pairKey(swapper, filler);
      if (counted.has(inputKey)) continue;
      counted.add(inputKey);

      let legs = transfersByPair[inputKey];
      if (!legs) {
        // Some tokens emit no standard Transfer on transferFrom (e.g. Privacy Inu on BSC,
        // 0xf8e96697b82fffb055ab64b298305600f5771f74), so the fill is valued from the filler's ERC-20 output to the
        // swapper instead. A native-token output leaves no log either; that fill cannot be valued and is skipped.
        legs = transfersByPair[pairKey(filler, swapper)];
        if (!legs) {
          console.log(`UniswapX: no ERC-20 leg between ${swapper} and ${filler} in ${txHash} on ${options.chain}, skipping fill`);
          continue;
        }
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
    // Every listed chain has tagged swaps daily; a missing row means Dune has not ingested the day yet.
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
    Volume: "Swaps routed by Uniswap's Trading API, which picks the best route across Uniswap pools and UniswapX fillers. Each swap is counted once at the value of the tokens sold. Swaps sent to Uniswap pools by other routers or aggregators and swaps in blacklisted scam tokens are excluded.",
  },
};

export default adapter;
