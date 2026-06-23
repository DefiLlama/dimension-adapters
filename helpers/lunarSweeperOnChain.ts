/**
 * On-chain LunarSweeperRouter volume (EVM only).
 */
import { Interface } from "ethers";
import { FetchOptions } from "../../adapters/types";
import { Balances } from "@defillama/sdk";

export const LUNAR_SWEEPER_ROUTER: Record<string, { address: string; start: string }> = {
  bsc: {
    address: "0x2e54Bd8c811e1a8EC80D869b9750FE7e45dEE561",
    start: "2025-01-01",
  },
};

const ROUTER_IFACE = new Interface([
  "function sweep((address tokenIn,uint256 amountIn,bytes data,uint256 value)[] legs, address recipient) payable",
  "function sweepWithPermit2((tuple(address token,uint256 amount)[] permitted,uint256 nonce,uint256 deadline) permit, tuple(address to,uint256 requestedAmount)[] permitDetails, bytes permitSignature, (address tokenIn,uint256 amountIn,bytes data,uint256 value)[] legs, address recipient) payable",
]);

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

type Leg = { tokenIn: string; amountIn: bigint };

function decodeLegs(tx: { input?: string; data?: string }): Leg[] {
  const data = tx.input ?? tx.data;
  if (!data || data.length < 10) return [];

  try {
    const parsed = ROUTER_IFACE.parseTransaction({ data });
    if (!parsed || (parsed.name !== "sweep" && parsed.name !== "sweepWithPermit2")) {
      return [];
    }
    const legs = parsed.args.legs as Array<{ tokenIn: string; amountIn: bigint }>;
    return legs.map((leg) => ({
      tokenIn:
        leg.tokenIn.toLowerCase() === NATIVE ? NATIVE : leg.tokenIn,
      amountIn: BigInt(leg.amountIn),
    }));
  } catch {
    return [];
  }
}

export async function fetchSweeperOnChainVolume(
  options: FetchOptions,
): Promise<Balances> {
  const dailyVolume = options.createBalances();
  const router = LUNAR_SWEEPER_ROUTER[options.chain];
  if (!router) return dailyVolume;

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const txs: Array<{ input?: string; data?: string; status?: number | string }> =
    await options.api.getTransactions({
      chain: options.chain,
      addresses: [router.address],
      from_block: fromBlock,
      to_block: toBlock,
      transactionType: "to",
    });

  for (const tx of txs) {
    if (tx.status !== undefined && tx.status !== 1 && tx.status !== "1") continue;
    for (const leg of decodeLegs(tx)) {
      dailyVolume.add(leg.tokenIn, leg.amountIn.toString());
    }
  }

  return dailyVolume;
}
