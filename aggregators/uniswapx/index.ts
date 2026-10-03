import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FILL = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// https://developers.uniswap.org/docs/liquidity/uniswapx/deployments
// https://github.com/Uniswap/UniswapX/blob/main/deployments.md
const reactors: Record<string, { start: string; targets: string[] }> = {
  [CHAIN.ETHEREUM]: {
    start: "2023-07-17",
    targets: [
      "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
      "0x00000011F84B9aa48e5f8aA8B9897600006289Be",
      "0x0000000015757c461808EA25Eb309638B62681cf",
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-01-01",
    targets: ["0xB274d5F4b833b61B340b654d600A864fB604a87c"],
  },
  [CHAIN.BASE]: {
    start: "2024-01-01",
    targets: [
      "0x000000001Ec5656dcdB24D90DFa42742738De729",
      "0x000000008a8330B5d1F43A62Bf4C673A49f27ba0",
    ],
  },
  [CHAIN.UNICHAIN]: {
    start: "2025-02-11",
    targets: [
      "0x00000006021a6Bce796be7ba509bbba71e956e37",
      "0x000000005aF66799D1a6317714D66800f9CA1406",
    ],
  },
  [CHAIN.AVAX]: {
    start: "2026-05-07",
    targets: ["0x00000000862cCF095823fc7576Fa6C7e6b7385ef"],
  },
  [CHAIN.BSC]: {
    start: "2026-05-07",
    targets: ["0x00000000a55e50C71b70Db3C8B58749cd1E18eB2"],
  },
  [CHAIN.INK]: {
    start: "2026-05-07",
    targets: ["0x000000007A1C8e570011EeDF86A2A35593013cBA"],
  },
  [CHAIN.MONAD]: {
    start: "2026-05-07",
    targets: ["0x000000000Ac008F7e07210CFb6648e40249232c2"],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-06-12",
    targets: ["0x000000007A1C8e570011EeDF86A2A35593013cBA"],
  },
  [CHAIN.TEMPO]: {
    start: "2026-05-07",
    targets: ["0x00000000fc1E66C9f582566EAd00108e55F1c0C6"],
  },
};

const addressFromTopic = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const fills = await options.getLogs({
    targets: reactors[options.chain].targets,
    eventAbi: FILL,
    entireLog: true,
    parseLog: true,
  });

  const fillsByTx = new Map<string, any[]>();
  for (const fill of fills) {
    const txHash = fill.transactionHash.toLowerCase();
    if (!fillsByTx.has(txHash)) fillsByTx.set(txHash, []);
    fillsByTx.get(txHash)!.push(fill.args);
  }

  const txHashes = [...fillsByTx.keys()];
  const provider = getProvider(options.chain);
  const { results, errors } = await PromisePool.withConcurrency(5).for(txHashes).process(async (txHash) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return { txHash, receipt };
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
    throw new Error(`Missing UniswapX fill receipt ${txHash}`);
  });
  if (errors.length) throw errors[0];

  for (const { txHash, receipt } of results) {
    const orders = fillsByTx.get(txHash)!;
    const fillCounts = new Map<string, number>();
    for (const { swapper, filler } of orders) {
      const key = `${swapper.toLowerCase()}:${filler.toLowerCase()}`;
      fillCounts.set(key, (fillCounts.get(key) ?? 0) + 1);
    }

    const inputs = receipt.logs.filter((log) => {
      if (log.topics.length !== 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) return false;
      return fillCounts.has(`${addressFromTopic(log.topics[1])}:${addressFromTopic(log.topics[2])}`);
    });

    const transferCounts = new Map<string, number>();
    for (const input of inputs) {
      const key = `${addressFromTopic(input.topics[1])}:${addressFromTopic(input.topics[2])}`;
      transferCounts.set(key, (transferCounts.get(key) ?? 0) + 1);
    }
    for (const [key, count] of fillCounts) {
      if (transferCounts.get(key) !== count)
        throw new Error(`Ambiguous UniswapX inputs for ${txHash}: ${key} has ${transferCounts.get(key) ?? 0} transfers for ${count} fills`);
    }

    for (const input of inputs) dailyVolume.add(input.address, BigInt(input.data));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "Executed UniswapX orders on official reactors, valued once per order from the swapper's input token transferred to the filler. Underlying AMM swaps can also appear in DEX volume; classic Uniswap AMM-only routes are excluded.",
  },
  adapter: reactors,
  fetch,
};

export default adapter;
