import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";

// Every UniswapX reactor (Exclusive Dutch, Dutch V2, Dutch V3, Priority) emits the same Fill event, which carries
// no amounts. The order input is pulled by Permit2 from the swapper to the filler (reactor msg.sender) inside the
// fill tx, so each order is valued from that ERC-20 Transfer in the tx receipt.
const FILL = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Reactor addresses: https://github.com/Uniswap/sdks/blob/main/sdks/uniswapx-sdk/src/constants.ts (REACTOR_ADDRESS_MAPPING)
// and https://github.com/Uniswap/UniswapX/blob/main/deployments.md
// The RelayOrderReactor (0x0000000000A4e21E2597DCac987455c48b12edBF) is excluded on purpose: relay orders only pay
// gas in tokens for a swap that settles through the Universal Router, so they are not swap volume.
// Reactors that have never filled an order (Optimism, Polygon V3, Worldchain, Soneium, Celo, Blast, Zora, Ink,
// Tempo, XLayer) and Polygon's Exclusive Dutch reactor (57 fills in total) are left out. Arc is left out because
// the RPC returns no receipts for its fill txs.
// start = first Fill on the chain.
const reactors: Record<string, { start: string; targets: string[] }> = {
  [CHAIN.ETHEREUM]: {
    start: "2023-07-27",
    targets: [
      "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4", // ExclusiveDutchOrderReactor
      "0x00000011F84B9aa48e5f8aA8B9897600006289Be", // V2DutchOrderReactor
      "0x0000000015757c461808EA25Eb309638B62681cf", // V3DutchOrderReactor
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-05-25",
    targets: [
      "0x1bd1aAdc9E230626C44a139d7E70d842749351eb", // V2DutchOrderReactor (active 2024-05 to 2025-10)
      "0xB274d5F4b833b61B340b654d600A864fB604a87c", // V3DutchOrderReactor
    ],
  },
  [CHAIN.BASE]: {
    start: "2024-08-14",
    targets: [
      "0x000000001Ec5656dcdB24D90DFa42742738De729", // PriorityOrderReactor
      "0x000000008a8330B5d1F43A62Bf4C673A49f27ba0", // V3DutchOrderReactor
    ],
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-01-28",
    targets: [
      "0x00000006021a6Bce796be7ba509bbba71e956e37", // PriorityOrderReactor
      "0x000000005aF66799D1a6317714D66800f9CA1406", // V3DutchOrderReactor
    ],
  },
  [CHAIN.BSC]: {
    start: "2026-06-11",
    targets: ["0x00000000a55e50C71b70Db3C8B58749cd1E18eB2"], // V3DutchOrderReactor
  },
  [CHAIN.AVAX]: {
    start: "2026-06-29",
    targets: ["0x00000000862cCF095823fc7576Fa6C7e6b7385ef"], // V3DutchOrderReactor
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-01",
    targets: ["0x000000007A1C8e570011EeDF86A2A35593013cBA"], // V3DutchOrderReactor
  },
  [CHAIN.MONAD]: {
    start: "2026-09-11",
    targets: ["0x000000000Ac008F7e07210CFb6648e40249232c2"], // V3DutchOrderReactor
  },
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
    const fetched = await getTxReceiptsWithRetry(chain, missing);
    fetched.forEach((receipt, i) => { if (receipt) receipts.set(missing[i], receipt); });
  }
  return txHashes.map((hash) => receipts.get(hash));
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const fills = await options.getLogs({
    targets: reactors[options.chain].targets,
    eventAbi: FILL,
    entireLog: true,
    parseLog: true,
  });

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
      for (const log of legs) dailyVolume.add(log.address, BigInt(log.data));
    }
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: reactors,
  methodology: {
    Volume: "Executed UniswapX orders (Dutch auction, Dutch V2/V3 and Priority orders) on Uniswap's official reactor contracts, each valued once from the input amount the swapper paid to the filler. Classic Uniswap AMM swaps that do not go through UniswapX are excluded, and fills that fillers source from AMM pools also appear in those DEXs' volume.",
  },
};

export default adapter;
