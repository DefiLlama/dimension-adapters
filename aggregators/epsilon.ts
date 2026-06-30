import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ROUTER = "0x303ca5c65AabCb1CE242DF93F478c41E0E4D2580";

// Direct swaps carry the full token pair in the event.
const SWAPPED =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)";

// Order fills (the bulk of activity) carry only hash + amounts, NOT the pair.
const ORDER_FILLED =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed keeper, uint256 amountIn, uint256 amountOut, uint256 remaining)";

// The pair lives in the `Order` struct — the first, fully-static arg of the
// keeper's execute* call: struct Order { uint256 salt; address maker; address
// receiver; address tokenIn; ... }. So tokenIn is the 4th ABI word after the
// selector; its address is the last 20 of that 32-byte word. In 0x-prefixed
// hex: 2 + (4 + 3*32)*2 + 24 = 226 .. 266.
const TOKEN_IN_START = 226;
const TOKEN_IN_END = 266;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  // 1) Direct swaps — value the input leg straight from the event.
  const swaps = await options.getLogs({ target: ROUTER, eventAbi: SWAPPED, fromBlock, toBlock });
  for (const s of swaps) dailyVolume.add(s.tokenIn, s.amountIn);

  // 2) Order fills — amountIn is the filled slice (from the event); tokenIn is
  //    recovered from the fill-tx calldata. Fetch each unique fill-tx once.
  const fills: any[] = await options.getLogs({ target: ROUTER, eventAbi: ORDER_FILLED, entireLog: true, fromBlock, toBlock });
  if (fills.length) {
    const provider = (options.api as any).provider;
    const txHashes = [...new Set(fills.map((l) => l.transactionHash))];
    const txs = await Promise.all(txHashes.map((h) => provider.getTransaction(h)));
    const inputByTx: Record<string, string> = Object.fromEntries(
      txHashes.map((h, i) => [h, txs[i]?.data ?? "0x"]),
    );

    for (const log of fills) {
      const input = inputByTx[log.transactionHash];
      if (!input || input.length < TOKEN_IN_END) continue; // not an Order-first call
      const tokenIn = "0x" + input.slice(TOKEN_IN_START, TOKEN_IN_END);
      const amountIn = BigInt(log.data.slice(0, 66)); // first non-indexed word
      dailyVolume.add(tokenIn, amountIn);
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-05-19",
    },
  },
};

export default adapter;
