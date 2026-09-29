import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// PancakeSwap X (PCSX): RFQ / Dutch-order intents filled by professional market makers
// from their own inventory, so fills do not route through any tracked AMM.
// Addresses are PancakeSwap's deployments, verified on-chain: routers emit Fill + FillData,
// standalone reactors emit Fill. Each start is the earliest reactor deployment on that chain
// (Robinhood: first Fill log).
const chainConfig: Record<string, { start: string; routers: string[]; reactors: string[] }> = {
  [CHAIN.BSC]: {
    start: "2024-01-19",
    routers: ["0x88815cAf0b12208585832B693841c9Da19C91687", "0x99aFa599C0D8E5d3C4CFca52bB81E5b2B4FD1661"],
    reactors: [
      "0x003BcEe8ca3e9B94aF07964F45e104FE0D68fD8C", // retired
      "0xDB9D365b50E62fce747A90515D2bd1254A16EbB9", // retired
      "0xd6c39f7729B8509ED01aa9d85c7C5CF7dd9b9916", // retired
      "0x18c8819146743C752122e3cA0Ae4B808ab1083e0", // retired
      "0x45CBe66536519D2cc9BAF594b502118eFdb291d1",
      "0x3e1edee0d8a8b74a59f7266ef2d3deb951bff582",
      "0xb75bb4c7aaacfa400758bf024c2ffefe17c9cbe3",
      "0x78A2cb3e5E0d55325BAD1AA40F20Ede78ECa9148",
    ],
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-08-21",
    routers: ["0x88815cAf0b12208585832B693841c9Da19C91687"],
    reactors: ["0x35db01D1425685789dCc9228d47C7A5C049388d8"],
  },
  [CHAIN.ETHEREUM]: {
    start: "2024-09-19",
    routers: ["0x88815cAf0b12208585832B693841c9Da19C91687", "0x99aFa599C0D8E5d3C4CFca52bB81E5b2B4FD1661"],
    reactors: ["0x35db01D1425685789dCc9228d47C7A5C049388d8", "0xb75bb4c7aaacfa400758bf024c2ffefe17c9cbe3"],
  },
  [CHAIN.BASE]: {
    start: "2026-03-03",
    routers: ["0x88815cAf0b12208585832B693841c9Da19C91687"],
    reactors: ["0x6b9906d7106e5890852Bf98eF13ba5D8761712b9", "0xb75bb4c7aaacfa400758bf024c2ffefe17c9cbe3"],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-01",
    routers: ["0x3dbca663C889A80ECf476741fDb094ea0c205aE8"],
    reactors: ["0xE5EfA0a98D56EFb203EE03bbf6365eEb8db87D6c", "0x56D7f29b2D7F5bfEb0f024e0e391A8E75F3cc2Dd"],
  },
};

const FILL_EVENT = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const FILL_DATA_EVENT = "event FillData(bytes32 indexed orderHash, address indexed inputToken, uint256 inputAmount, (address token, uint256 amount, address recipient)[] outputs)";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const toAddressTopic = (address: string) => "0x" + address.slice(2).toLowerCase().padStart(64, "0");

type Transfer = { token: string; from: string; to: string; value: bigint; logIndex: number; used: boolean };

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { routers, reactors } = chainConfig[options.chain];

  const fillData = await options.getLogs({ targets: routers, eventAbi: FILL_DATA_EVENT });
  fillData.forEach((log: any) => dailyVolume.add(log.inputToken, log.inputAmount));

  // Standalone reactor fills carry no amounts: the swapper's input is pulled via Permit2
  // straight to the filler, so pair each Fill with that Transfer from the same tx.
  const fills = await options.getLogs({ targets: reactors, eventAbi: FILL_EVENT, entireLog: true, parseLog: true });
  if (!fills.length) return { dailyVolume };

  const fillers = [...new Set(fills.map((log: any) => log.parsedLog.args.filler.toLowerCase()))];
  const fillTxs = new Set(fills.map((log: any) => log.transactionHash.toLowerCase()));

  const transfersByTx: Record<string, Transfer[]> = {};
  for (const filler of fillers) {
    // The input token is unknown until the transfer is seen, so no token targets can be
    // given. The recipient topic filter runs server-side, returning only transfers into this
    // filler (the same query addTokensReceived's log fallback issues).
    const transfers = await options.getLogs({
      noTarget: true,
      eventAbi: TRANSFER_EVENT,
      topics: [TRANSFER_TOPIC, null as any, toAddressTopic(filler)],
      entireLog: true,
      parseLog: true,
    });
    transfers.forEach((log: any) => {
      const tx = log.transactionHash.toLowerCase();
      // ERC-721 Transfer shares the topic but indexes tokenId, so it fails to parse
      if (!fillTxs.has(tx) || !log.parsedLog) return;
      (transfersByTx[tx] ??= []).push({
        token: log.address,
        from: log.parsedLog.args.from.toLowerCase(),
        to: filler,
        value: log.parsedLog.args.value,
        logIndex: Number(log.logIndex),
        used: false,
      });
    });
  }

  // Reactors pull every order's input before emitting its Fill, and in the same order,
  // so each Fill takes the earliest unused swapper -> filler transfer that precedes it.
  Object.values(transfersByTx).forEach((transfers) => transfers.sort((a, b) => a.logIndex - b.logIndex));
  [...fills].sort((a: any, b: any) => Number(a.logIndex) - Number(b.logIndex)).forEach((log: any) => {
    const swapper = log.parsedLog.args.swapper.toLowerCase();
    const filler = log.parsedLog.args.filler.toLowerCase();
    const input = transfersByTx[log.transactionHash.toLowerCase()]?.find(
      (t) => !t.used && t.from === swapper && t.to === filler && t.logIndex < Number(log.logIndex),
    );
    if (!input) return;
    input.used = true;
    dailyVolume.add(input.token, input.value);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume:
      "Input amount of every filled PancakeSwap X order. MultiReactor router fills emit FillData with the resolved input token and amount; " +
      "fills on standalone reactors emit only Fill, so the input is read from the swapper-to-filler token transfer in the same transaction.",
  },
};

export default adapter;
