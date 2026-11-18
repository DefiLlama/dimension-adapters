import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";
import { RELAY_LISTED_UNTIL, relayTotals } from "./relay";

// Sweep (https://trysweep.finance) - turns many token balances across chains into one or two tokens in one go, sending
// each balance over the route it finds best. Swaps on one chain are counted here; legs that cross chains are in
// bridge-aggregators/sweep-finance.
//
// A swap is Sweep's when it pays a nonzero fee to Sweep's fee wallet:
// - Fly: its router takes each swap's fees before it swaps and lists them in its Swap log: Fly's own fee and the fee of
//   the integrator that sent the swap. Sweep names its fee wallet as that integrator, so a Swap log that pays a nonzero
//   fee to Sweep's fee wallet is Sweep's. Fly counts the same swaps in aggregators/magpie, hence doublecounted.
// - Relay: Sweep's requests that pay Sweep's fee wallet an app fee, with the figures Relay reports (./relay.ts).
// Sweep's Fly swaps on zkSync Era and Robinhood Chain are not counted.

// Sweep's fee wallet on EVM chains: the affiliate of its Fly swaps and the app fee recipient of its Relay requests (also
// the fee recipient of its Across and Mayan legs, bridge-aggregators/sweep-finance).
const FEE_WALLET = "0xc5205f558d955f60313c3f08986af56e24ad94ad";

// Fly's DexAggregator router on the chains below, as in fees/fly-trade: https://docs.fly.trade/developers/deployments
const FLY_ROUTER = "0x20f6ee51340adeed01a59b0e65cb3703f3dc860c";

const FLY_SWAP = "event Swap(address fromAddress, address toAddress, address fromAssetAddress, address toAssetAddress, uint256 amountIn, uint256 amountOut, uint256 expectedAmountOut, uint256 amountInSurplus, uint256 amountOutSurplus, bytes32 consumerId, address[] swapFeeAssetAddresses, address[] swapFeeReceivers, uint256[] swapFeeAmounts)";

// Where the logs indexer does not serve a call, logs are read 10,000 blocks per eth_getLogs, as bridge-aggregators/lifi
// does.
const LOGS_BLOCK_RANGE = 10000;

// Each chain with Sweep's swaps, from the day the first of them was made, and whether Sweep's swaps there go through
// Fly's router.
type ChainConfig = { start: string; fly?: boolean };
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { start: "2026-08-13", fly: true },
  [CHAIN.ARBITRUM]: { start: "2026-07-28", fly: true },
  [CHAIN.OPTIMISM]: { start: "2026-11-05", fly: true },
  [CHAIN.BASE]: { start: "2026-08-03", fly: true },
  [CHAIN.BSC]: { start: "2026-07-27", fly: true },
  [CHAIN.ERA]: { start: "2026-10-01" },
  [CHAIN.ROBINHOOD]: { start: "2026-09-13" },
  [CHAIN.INK]: { start: "2026-09-27" },
  [CHAIN.MONAD]: { start: "2026-10-11" },
  [CHAIN.CELO]: { start: "2026-11-05" },
  [CHAIN.MANTLE]: { start: "2026-11-11" },
  [CHAIN.SCROLL]: { start: "2026-11-11" },
  [CHAIN.SONEIUM]: { start: "2026-11-11" },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  if (chainConfig[options.chain].fly) {
    const blacklisted = new Set(getDefaultDexTokensBlacklisted(options.chain));
    const swaps = await options.getLogs({ target: FLY_ROUTER, eventAbi: FLY_SWAP, maxBlockRange: LOGS_BLOCK_RANGE });
    for (const log of swaps) {
      const paysSweepFee = log.swapFeeReceivers.some((receiver: string, i: number) => formatAddress(receiver) === FEE_WALLET && BigInt(log.swapFeeAmounts[i]) > 0n);
      if (!paysSweepFee) continue;
      // Same token filter as the LI.FI adapters.
      if (blacklisted.has(formatAddress(log.fromAssetAddress)) || blacklisted.has(formatAddress(log.toAssetAddress))) continue;
      // Counted at what the user received: Sweep's inputs are often small leftover balances, its outputs the token the
      // user chose to hold.
      dailyVolume.add(log.toAssetAddress, log.amountOut);
    }
  }

  const relay = relayTotals(options).sameChain[options.chain];
  if (relay) dailyVolume.addUSDValue(relay);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true,
  methodology: {
    Volume: `Value of the same-chain swaps users make through Sweep. Through Fly: the output amount of every Swap log on Fly's router that pays a nonzero fee to Sweep's fee wallet, leaving out swaps of tokens on DefiLlama's default DEX blacklist. Through Relay: the USD value that arrived, as Relay reports it, of every filled Relay request on one chain made for Sweep's app that pays Sweep's fee wallet an app fee, listed up to ${RELAY_LISTED_UNTIL} (the smaller of the values sent and arrived where they differ more than 2x). Not counted: Sweep's Fly swaps on zkSync Era and Robinhood Chain, and its Relay requests made after ${RELAY_LISTED_UNTIL}.`,
  },
};

export default adapter;
