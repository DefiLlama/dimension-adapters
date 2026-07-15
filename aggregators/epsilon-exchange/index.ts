import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactions } from "../../helpers/getTxReceipts";

// EpsilonRouter v7 on Robinhood Chain.
const ROUTER = "0x367832cF3787b69fEFA1a0fdF3FcEE9DBc7631C1";

// Direct swaps carry the full token pair in the event.
const SWAPPED =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)";

// Order fills (limit / DCA / trailing-stop executions) carry only hash +
// amounts, NOT the pair.
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

  // 1) Direct swaps — value the input leg straight from the event.
  const swaps = await options.getLogs({ target: ROUTER, eventAbi: SWAPPED });
  for (const s of swaps) dailyVolume.add(s.tokenIn, s.amountIn);

  // 2) Order fills — amountIn is the filled slice (from the event); tokenIn is
  //    recovered from the fill-tx calldata. Fetch each unique fill-tx once.
  const fills: any[] = await options.getLogs({ target: ROUTER, eventAbi: ORDER_FILLED, entireLog: true, parseLog: true });
  if (fills.length) {
    const txHashes = [...new Set(fills.map((l) => l.transactionHash))];
    const txs = await getTransactions(options.chain, txHashes);
    const inputByTx: Record<string, string> = {};
    for (let i = 0; i < txHashes.length; i++) {
      const hash = txHashes[i].toLowerCase();
      const tx = txs[i];
      if (!tx?.hash) throw new Error(`Missing transaction for OrderFilled tx ${hash}`);
      const input = tx.data ?? "0x";
      if (input.length < TOKEN_IN_END) {
        throw new Error(`Unexpected calldata for OrderFilled tx ${hash}`);
      }
      inputByTx[hash] = input;
    }

    for (const log of fills) {
      const txHash = log.transactionHash.toLowerCase();
      const input = inputByTx[txHash];
      if (!input) throw new Error(`Missing calldata for OrderFilled log in tx ${txHash}`);
      const tokenIn = "0x" + input.slice(TOKEN_IN_START, TOKEN_IN_END);
      dailyVolume.add(tokenIn, log.args.amountIn);
    }
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of direct swap volumes and order fill volumes (limit, DCA and trailing-stop orders) routed through the Epsilon router on Robinhood Chain",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-07-14",
  methodology,
};

export default adapter;
