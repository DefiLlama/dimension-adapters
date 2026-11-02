import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { assertDuneSolanaIndexed } from "../../helpers/duneSolanaDex";
import { isCoreAsset } from "../../helpers/prices";
import { fetchRelayTotals, RelayTotals } from "./relay";
import { addToken, rank, ROUTER, SwappedEvent, SwappedManyEvent } from "./router";
import { fetchSolanaVolume, SOLANA_START } from "./solana";

// Scrooge (https://scrooge.exchange): swap aggregator on Robinhood Chain. It compares KyberSwap, Nordstern,
// SushiSwap, Uniswap and other venues and settles the chosen route through its own router, ScroogeRouter (./router.ts),
// which emits one event per swap. Swaps the site sends straight to a venue's own router (0x, Uniswap) are not counted.
// Swaps Scrooge takes through LI.FI, on Robinhood Chain or on another chain (buying a coin on Ethereum, Base,
// Arbitrum or BNB Chain), are sent under the integrator string "scrooge" and counted from LI.FI's
// LiFiGenericSwapCompleted logs, as in aggregators/hyperdex. Swaps on BNB Chain or Base that Scrooge takes through Relay
// are read from Relay's requests API by the referrer Scrooge's site sends (./relay.ts). Swaps on Solana, built on
// Jupiter with Scrooge's fee paid in the same transaction, are read from Dune (./solana.ts), so the adapter runs a day at
// a time. Scrooge's fees are in fees/scrooge, cross-chain routes in bridge-aggregators/scrooge.

const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";
const LIFI_INTEGRATOR = "scrooge";
const NATIVE = ADDRESSES.null;

// Same-chain swaps through LI.FI under Scrooge's integrator string, counted once on the side that is the native coin
// or a core asset: most are new coins bought or sold for ETH or a stablecoin, whose own side is not priced. Where
// both sides are, the output is preferred when the input is the native coin, as native-in facets emit a
// caller-declared fromAmount (see aggregators/hyperdex). A day's logs are read 10,000 blocks per eth_getLogs, as
// bridge-aggregators/lifi does: a day is over 800,000 blocks on Robinhood Chain and ~350,000 on Arbitrum, past the range
// RPCs serve in one call where the logs indexer does not cover the chain.
const addLifiSwaps = async (options: FetchOptions, dailyVolume: any) => {
  const logs = await options.getLogs({ target: LifiDiamonds[options.chain].id, eventAbi: LifiSwapEvent, maxBlockRange: 10000 });
  const core = (token: string) => token.toLowerCase() === NATIVE || isCoreAsset(options.chain, token);
  for (const log of logs) {
    if (log.integrator !== LIFI_INTEGRATOR) continue;
    const nativeIn = log.fromAssetId.toLowerCase() === NATIVE;
    if (core(log.toAssetId) && (nativeIn || !core(log.fromAssetId))) dailyVolume.add(log.toAssetId, log.toAmount);
    else dailyVolume.add(log.fromAssetId, log.fromAmount);
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  if (options.chain === CHAIN.SOLANA) {
    for (const { mint, amount } of await fetchSolanaVolume(options)) dailyVolume.add(mint, amount);
    return { dailyVolume };
  }

  await addLifiSwaps(options, dailyVolume);
  const relay: RelayTotals = options.preFetchedResults;
  dailyVolume.addUSDValue(relay.sameChain[options.chain] ?? 0);
  if (options.chain !== CHAIN.ROBINHOOD) return { dailyVolume };

  const [single, split] = await Promise.all([
    options.getLogs({ target: ROUTER, eventAbi: SwappedEvent }),
    options.getLogs({ target: ROUTER, eventAbi: SwappedManyEvent }),
  ]);
  for (const log of [...single, ...split]) {
    // One side of each swap, the better valued: the input, unless only the output is valued, then the output before the fee.
    if (rank(log.tokenIn) >= rank(log.tokenOut)) addToken(dailyVolume, log.tokenIn, BigInt(log.amountIn));
    else addToken(dailyVolume, log.tokenOut, BigInt(log.received));
  }

  return { dailyVolume };
};

// runAdapter drops every chain's record when one chain throws, so Dune's Solana indexing delay is checked once, before
// any chain runs, rather than in the Solana leg after the other chains have done their work.
const prefetch = async (options: FetchOptions): Promise<RelayTotals> => {
  assertDuneSolanaIndexed(options);
  return fetchRelayTotals(options);
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-09-22" },
    // The first swap under Scrooge's LI.FI integrator string, 2026-10-12.
    [CHAIN.ETHEREUM]: { start: "2026-10-12" },
    [CHAIN.BASE]: { start: "2026-10-12" },
    [CHAIN.ARBITRUM]: { start: "2026-10-12" },
    [CHAIN.BSC]: { start: "2026-10-12" },
    [CHAIN.SOLANA]: { start: SOLANA_START },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Every swap settled through ScroogeRouter (Swapped and SwappedMany events), counted once at its input amount when the input is ETH or a core asset, otherwise at its output before Scrooge's fee; a swap between a new token and SCROOGE is valued on its SCROOGE side. A route split across venues counts once at its total. Swaps the site sends straight to a venue's own router are not counted. Swaps through LI.FI under the integrator \"scrooge\", on Robinhood Chain and other chains, from LiFiGenericSwapCompleted logs; swaps on one chain through Relay under Scrooge's referrer \"scrooge.exchange\" that pay Scrooge's app fee, at the USD value Relay reports sent (since 2026-10-29; Scrooge's earlier Relay swaps carry no referrer and are not counted). On Solana, every successful Jupiter v6 transaction that paid Scrooge's fee wallet (SOL, or Jupiter's platform fee in wrapped SOL to its token account), valued once from Jupiter's swap events as aggregators/jupiter-aggregator does.",
  },
};

export default adapter;
