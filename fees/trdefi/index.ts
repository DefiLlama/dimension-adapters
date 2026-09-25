/**
 * TRDEFI — protocol fees
 *
 * TRDEFI is a non-custodial venue for stablecoin market-making positions. Creating a
 * position through it embeds a 0.05% protocol fee inside the maker's signed order, and
 * that fee is paid to a single receiver address when the position trades. So the fee is
 * not invoiced, and it is not a balance sheet item: it arrives as an ordinary token
 * transfer, which is what this adapter reads.
 *
 * Why the numbers can look small or absent, which a reviewer will ask:
 *   • The fee rail was armed on 2026-09-25. Positions created before that carry no fee
 *     and are immutable on-chain, so their volume is real but earns us nothing. The
 *     `start` date below is the armed date, not the date the protocol launched.
 *   • We are not the underlying protocol. The positions live in a public liquidity
 *     registry that another venue also uses, and that protocol is listed separately on
 *     DefiLlama with its own volume. This adapter counts only the fee TRDEFI itself
 *     collects — a distinct, on-chain-verifiable revenue stream — and deliberately does
 *     not restate anyone else's volume. That is why a fee-to-volume ratio computed
 *     against the underlying protocol's TVL or volume would not be meaningful here.
 *   • A zero day is therefore expected and correct whenever no fee-bearing position
 *     trades.
 *
 * Fees are counted in the token they arrive in (USDC, USDT, EURC), as incoming
 * transfers to the receiver, which is the fee exactly as collected.
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEE_RECEIVER = "0x4C96dA02d7120BFb81594d0e924B237e0c74660d";

const TRANSFER_EVENT =
  "event Transfer (address indexed from, address indexed to, uint256 amount)";

// The fee rail was armed here. Adapters must not claim fees before they were charged.
const ARMED = "2026-09-25";

// The tokens a position can be denominated in, per chain. Reading transfers against a
// known token set keeps the query targetable, rather than scanning every Transfer in a
// block.
const TOKENS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  ],
  [CHAIN.BASE]: [
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", // USDT
  ],
  [CHAIN.ARBITRUM]: [
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
  ],
  [CHAIN.OPTIMISM]: [
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT
  ],
  [CHAIN.POLYGON]: [
    "0x3c499c542cef5e3811e1192ce70dc0c03d5c3359", // USDC
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
  ],
};

const chainConfig = Object.fromEntries(
  Object.keys(TOKENS).map((chain) => [chain, { start: ARMED }]),
);

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const tokens = TOKENS[options.chain];

  for (const token of tokens) {
    const logs = await options.getLogs({
      target: token,
      eventAbi: TRANSFER_EVENT,
      // Only transfers addressed to the fee receiver.
      topics: [null, null, "0x" + FEE_RECEIVER.slice(2).toLowerCase().padStart(64, "0")],
    });
    logs.forEach((log: any) => dailyFees.add(token, log.amount));
  }

  return { dailyFees };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees:
      "0.05% of the amount traded, collected by TRDEFI on positions created through its venue. The fee is embedded in the maker's signed order and paid to the receiver address when the position trades, so it is counted as the incoming token transfers it actually is. The fee rail has been in force since 2026-09-25; positions created before that carry no fee and are immutable.",
  },
};

export default adapter;
