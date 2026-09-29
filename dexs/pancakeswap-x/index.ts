import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";

// PancakeSwap X (PCSX): RFQ / Dutch-order intents filled by professional market makers
// from their own inventory, so fills do not route through any tracked AMM.
// Address source: https://github.com/pancakeswap/pancake-frontend/blob/develop/packages/pcsx-sdk/src/constants.ts
const MULTI_REACTOR_ROUTERS: Record<string, string[]> = {
  [CHAIN.BSC]: ["0x88815cAf0b12208585832B693841c9Da19C91687", "0x99aFa599C0D8E5d3C4CFca52bB81E5b2B4FD1661"],
  [CHAIN.ETHEREUM]: ["0x88815cAf0b12208585832B693841c9Da19C91687", "0x99aFa599C0D8E5d3C4CFca52bB81E5b2B4FD1661"],
  [CHAIN.ARBITRUM]: ["0x88815cAf0b12208585832B693841c9Da19C91687"],
  [CHAIN.BASE]: ["0x88815cAf0b12208585832B693841c9Da19C91687"],
  [CHAIN.ROBINHOOD]: ["0x3dbca663C889A80ECf476741fDb094ea0c205aE8"],
};

// Standalone reactors (current and retired) that emit only Fill, without amounts
const REACTORS: Record<string, string[]> = {
  [CHAIN.BSC]: [
    "0x003BcEe8ca3e9B94aF07964F45e104FE0D68fD8C",
    "0xDB9D365b50E62fce747A90515D2bd1254A16EbB9",
    "0xd6c39f7729B8509ED01aa9d85c7C5CF7dd9b9916",
    "0x18c8819146743C752122e3cA0Ae4B808ab1083e0",
    "0x45CBe66536519D2cc9BAF594b502118eFdb291d1",
    "0x3e1edee0d8a8b74a59f7266ef2d3deb951bff582",
    "0xb75bb4c7aaacfa400758bf024c2ffefe17c9cbe3",
    "0x78A2cb3e5E0d55325BAD1AA40F20Ede78ECa9148",
  ],
  [CHAIN.ETHEREUM]: ["0x35db01D1425685789dCc9228d47C7A5C049388d8", "0xb75bb4c7aaacfa400758bf024c2ffefe17c9cbe3"],
  [CHAIN.ARBITRUM]: ["0x35db01D1425685789dCc9228d47C7A5C049388d8"],
  [CHAIN.BASE]: ["0x6b9906d7106e5890852Bf98eF13ba5D8761712b9", "0xb75bb4c7aaacfa400758bf024c2ffefe17c9cbe3"],
  [CHAIN.ROBINHOOD]: ["0xE5EfA0a98D56EFb203EE03bbf6365eEb8db87D6c", "0x56D7f29b2D7F5bfEb0f024e0e391A8E75F3cc2Dd"],
};

const FILL_EVENT = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const FILL_DATA_EVENT = "event FillData(bytes32 indexed orderHash, address indexed inputToken, uint256 inputAmount, (address token, uint256 amount, address recipient)[] outputs)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const toTopicAddress = (topic: string) => ("0x" + topic.slice(26)).toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const fillData = await options.getLogs({ targets: MULTI_REACTOR_ROUTERS[options.chain], eventAbi: FILL_DATA_EVENT, skipIndexer: true });
  fillData.forEach((log: any) => dailyVolume.add(log.inputToken, log.inputAmount));

  // Standalone reactor fills carry no amounts: the swapper's input is pulled via Permit2
  // straight to the filler in the same tx, so read that Transfer from the receipt.
  const fills = await options.getLogs({ targets: REACTORS[options.chain], eventAbi: FILL_EVENT, entireLog: true, parseLog: true, skipIndexer: true });
  const fillsByTx: Record<string, { filler: string; swapper: string }[]> = {};
  fills.forEach((log: any) => {
    const tx = log.transactionHash.toLowerCase();
    const { filler, swapper } = log.parsedLog.args;
    (fillsByTx[tx] ??= []).push({ filler: filler.toLowerCase(), swapper: swapper.toLowerCase() });
  });

  const txHashes = Object.keys(fillsByTx);
  const receipts = await getTxReceiptsWithRetry(options.chain, txHashes);
  if (receipts.some((r) => !r)) throw new Error(`${options.chain}: missing receipts for PancakeSwap X fills`);
  receipts.forEach((receipt, i) => {
    if (!receipt) return;
    // A tx can batch several orders; each (swapper, filler) input transfer is counted once
    const pending = fillsByTx[txHashes[i]].map((f) => `${f.swapper}-${f.filler}`);
    receipt.logs.forEach((log) => {
      if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) return;
      const idx = pending.indexOf(`${toTopicAddress(log.topics[1])}-${toTopicAddress(log.topics[2])}`);
      if (idx === -1) return;
      pending.splice(idx, 1);
      dailyVolume.add(log.address, BigInt(log.data));
    });
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: "2024-01-19" },
    [CHAIN.ARBITRUM]: { start: "2024-08-21" },
    [CHAIN.ETHEREUM]: { start: "2024-09-19" },
    [CHAIN.BASE]: { start: "2026-03-03" },
    [CHAIN.ROBINHOOD]: { start: "2026-07-01" },
  },
  methodology: {
    Volume:
      "Input amount of every filled PancakeSwap X order. MultiReactor router fills emit FillData with the resolved input token and amount; " +
      "fills on standalone reactors emit only Fill, so the input is read from the swapper-to-filler token transfer in the same transaction.",
  },
};

export default adapter;
