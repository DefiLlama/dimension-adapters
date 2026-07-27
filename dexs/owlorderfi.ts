import { SimpleAdapter, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * OwlOrderFi — non-custodial limit / stop / TWAP / DCA order router for
 * Uniswap V3. Makers sign EIP-712 order intents off-chain; an authorized
 * keeper executes them on-chain when the conditions are met. The router holds
 * no user funds between transactions, which is why the protocol is tracked by
 * volume rather than TVL.
 *
 * Two routers per chain: the current deployment and the one it replaced. Both
 * are indexed so history is continuous across the redeploy.
 */

const config = {
  [CHAIN.BASE]: {
    routers: [
      "0xC11fC6362d29D6831B7431F3B7d5F9a6128bd5aA", // current, from 2026-07-27
      "0x30e744fB8120C3f6f8CF958e5110E6349fAaA259", // previous, from 2026-05-31
    ],
    start: "2026-05-31", // first Base deployment
  },
  [CHAIN.POLYGON]: {
    routers: [
      "0x42cB3F5D39d11193cC9436b155F094Aa7cbcf52B", // current, from 2026-07-27
      "0x30e744fB8120C3f6f8CF958e5110E6349fAaA259", // previous, from 2026-06-01
    ],
    start: "2026-06-01", // first Polygon deployment
  },
} as { [chain: string]: { routers: string[]; start: string } };

const ORDER_EXECUTED =
  "event OrderExecuted(bytes32 indexed orderHash, address indexed maker, address indexed keeper, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint8 orderType)";

/**
 * The previous router signals a cancellation by emitting OrderExecuted with
 * `orderType = type(uint8).max` and every amount zeroed, which is
 * indistinguishable from a fill unless the sentinel is filtered. Counting one
 * would also feed a zero token address into the balance lookup.
 *
 * No such log exists in the history so far — every cancellation to date was
 * recorded off-chain only — but the old router is still live and anyone can
 * still invalidate their own nonce on it, so the guard is against future logs
 * rather than a correction of past ones. The current router emits a dedicated
 * OrderCancelled event, so this only ever applies to the previous address.
 */
const CANCEL_SENTINEL = 255n;

const fetch: FetchV2 = async ({ getLogs, chain, createBalances }) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  // One call per router rather than a single `targets` call: the shape of a
  // multi-target result depends on the `flatten` default, and a wrong guess
  // there iterates arrays instead of logs. Two calls are unambiguous.
  for (const router of config[chain].routers) {
    const logs = await getLogs({ target: router, eventAbi: ORDER_EXECUTED });

    for (const log of logs) {
      if (BigInt(log.orderType) === CANCEL_SENTINEL) continue;
      // Input leg only. Adding tokenOut as well would double-count the same
      // trade, and `amountOut` is already net of the protocol fee.
      dailyVolume.add(log.tokenIn, log.amountIn);
      // The fee is taken from the output token, before the remainder is
      // forwarded to the maker.
      dailyFees.add(log.tokenOut, log.fee);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    // The whole fee accrues to the protocol: the router has no liquidity
    // providers of its own. Pool fees belong to Uniswap and are not counted
    // here.
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
  };
};

const adapters: any = {};
Object.keys(config).forEach((chain) => {
  adapters[chain] = { fetch, start: config[chain].start };
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: adapters,
  methodology: {
    Volume:
      "Sum of the input amount of every executed order, taken from the router's OrderExecuted logs. Only the input leg is counted, so a single trade is never counted twice. Cancellations, which the previous router encoded as an OrderExecuted with orderType 255, are excluded.",
    Fees: "Protocol fee deducted from the output token of each executed order. The rate is signed by the maker as part of the order and capped on-chain at 1%.",
    Revenue: "All fees. The router has no liquidity providers, so nothing is shared out.",
    ProtocolRevenue: "All fees.",
    SupplySideRevenue: "None. Liquidity is Uniswap's; its pool fees are not counted here.",
  },
};

export default adapter;
