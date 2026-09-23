import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";
import ADDRESSES from "../../helpers/coreAssets.json";

// Meow: DEX aggregator on Robinhood Chain (chain id 4663), https://meow.exchange
// Every settled swap emits `Swapped` once on the router that executed it, and
// the router's own output fee (0.25% default, tiered by holdings) emits
// `FeeCollected` in the same transaction. Inner venue hops are not counted.
//
// Routers are redeployed as execution improves. Every deployment is recorded
// on-chain in MeowRouterRegistry, an append-only list owned by the router
// owner: `routers()` at the end of the window returns every router registered
// up to that block, retired ones included, so a new router never needs an
// adapter change. Verified source: https://repo.sourcify.dev/4663/0x7b592Bf516cE94AE28e24e34d709Cb95fE596005
const REGISTRY = "0x7b592Bf516cE94AE28e24e34d709Cb95fE596005";
const REGISTRY_FROM_BLOCK = 70680538; // registry deployment block, 2026-09-23
// Routers deployed before the registry existed. The registry constructor was
// seeded with the same list; deployment blocks 33693446 through 69162998.
const SEED_ROUTERS = [
  "0x6493A49d5b5C5Befe60d6EC7F633fd317545DdDC",
  "0xcbA20b3109ef4944DeAfC265B4b3d38316a3a17A",
  "0x327e80A5eA5A78d1Ce0A497Be4b4f4cd8B3Fafb0",
  "0xe8753b4690685A2067Af15056dA316ef42691A9a",
  "0x70f5e4A7a15990472aE75B0F7DB80f1c99D2C1Ef", // HoodAggregatorV2, current router (block 69162998)
];

const ABI_ROUTERS = "function routers() view returns (address[])";
const EVENT_SWAPPED =
  "event Swapped(address indexed sender, address indexed recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)";
const EVENT_FEE_COLLECTED =
  "event FeeCollected(address indexed token, address indexed recipient, uint256 amount)";

// Native ETH is reported as the zero address on the swap side; fees are always
// taken in the ERC20 the route settles in (WETH for native output).
const NATIVE = ADDRESSES.null;
const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";

type Balances = ReturnType<FetchOptions["createBalances"]>;

function addToken(balances: Balances, token: string, amount: any, label?: string) {
  if (token.toLowerCase() === NATIVE) balances.addGasToken(amount, label);
  else balances.add(token, amount, label);
}

async function routersAt(options: FetchOptions): Promise<string[]> {
  const toBlock = await options.getToBlock();
  if (toBlock < REGISTRY_FROM_BLOCK) return SEED_ROUTERS;
  return options.api.call({ target: REGISTRY, abi: ABI_ROUTERS });
}

async function fetch(options: FetchOptions) {
  const { createBalances, getLogs, chain } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const targets = await routersAt(options);

  const swaps = await getLogs({ targets, eventAbi: EVENT_SWAPPED });
  for (const log of swaps) {
    // One entry per swap. Prefer the side that is a core asset so a trade
    // against a freshly launched token is still valued: amountIn is what the
    // trader paid; amountOut is what the recipient received after the fee.
    if (isCoreAsset(chain, log.tokenIn)) addToken(dailyVolume, log.tokenIn, log.amountIn);
    else addToken(dailyVolume, log.tokenOut, log.amountOut);
  }

  const fees = await getLogs({ targets, eventAbi: EVENT_FEE_COLLECTED });
  for (const log of fees) {
    dailyFees.add(log.token, log.amount, SWAP_FEES);
    dailyRevenue.add(log.token, log.amount, SWAP_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.add(log.token, log.amount, SWAP_FEES_TO_PROTOCOL);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue: 0 };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-11",
  methodology: {
    Volume:
      "Every Swapped event emitted by a Meow router, counted once per swap using the core-asset side of the trade (input amount when the input token is a core asset, otherwise the output amount delivered). Routers are read from MeowRouterRegistry at the end of the window; inner venue hops are not counted.",
    Fees:
      "Meow's own output fee (0.25% by default, lower for wallets holding the configured token), taken from each swap's output and emitted as FeeCollected. Fees charged by the underlying pools are not included.",
    Revenue: "All swap fees accrue to the Meow treasury.",
    ProtocolRevenue: "All swap fees are retained by the Meow treasury.",
    SupplySideRevenue: "No part of the fee goes to liquidity providers, integrators or referrers.",
  },
  breakdownMethodology: {
    Fees: { [SWAP_FEES]: "Output fee charged on each swap routed through a Meow router, using the actual amount collected." },
    Revenue: { [SWAP_FEES_TO_PROTOCOL]: "Swap fees accrued to the Meow treasury." },
    ProtocolRevenue: { [SWAP_FEES_TO_PROTOCOL]: "Swap fees retained by the Meow treasury." },
  },
};

export default adapter;
