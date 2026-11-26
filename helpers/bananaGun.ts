import * as sdk from "@defillama/sdk";
import { AbiCoder, toQuantity } from "ethers";
import { FetchOptions } from "../adapters/types";
import { rpcCall } from "./arbitrumNitroFees";
import { CHAIN } from "./chains";
import ADDRESSES from "./coreAssets.json";

// Second Banana Gun router (owner 0x1d75e498fd7602391b568f83c1d7827221e5d04c on every chain), one event per swap.
// start is the first day with a user swap; the Base events of 2025-12-09 are the owner's own tests.
const ROUTER_V2: Record<string, { start: string; router: string; wrappedNative: string }> = {
  [CHAIN.ETHEREUM]: { start: "2026-02-08", router: "0x734ab9de48f6bab1f2297a34d257cd757deba6aa", wrappedNative: ADDRESSES.ethereum.WETH },
  [CHAIN.BASE]: { start: "2025-12-10", router: "0x3b999c008dafb5952a992a4e098dac9034cd5dbd", wrappedNative: ADDRESSES.base.WETH },
  [CHAIN.BSC]: { start: "2026-01-22", router: "0x12f420e5cb154acdae7f51313f370d74c0e8cfdd", wrappedNative: ADDRESSES.bsc.WBNB },
};

const swapEvent = "event AggregatedSwapTrace(bytes trace)";
const traceTypes = ["address", "address", "address", "uint256", "uint256", "uint256"];

// Code of a user wallet delegated (EIP-7702) to Banana Gun's delegate. Such wallets emit the swap event themselves
// and pay the fee to the router.
const DELEGATED_WALLET_CODE = "0xef0100535023ed14a1862444ec29d0fe07cf3092c73bc2";

export async function getRouterV2Swaps(options: FetchOptions) {
  const config = ROUTER_V2[options.chain];
  if (!config || options.dateString < config.start) return [];

  const logs = await options.getLogs({ noTarget: true, eventAbi: swapEvent, entireLog: true });

  // Anyone can emit this event, so other emitters count only if they were delegated wallets at the swap's block.
  const isOwn = await sdk.util.runInPromisePool({
    items: logs,
    concurrency: 5,
    processor: async (log: any) => log.address.toLowerCase() === config.router
      || (await rpcCall(options.chain, "eth_getCode", [log.address, toQuantity(log.blockNumber)])).toLowerCase() === DELEGATED_WALLET_CODE,
  });

  const isNative = (token: string) => [ADDRESSES.null, config.wrappedNative.toLowerCase()].includes(token);

  return logs.filter((_: any, i: number) => isOwn[i]).map((log: any) => {
    if (log.args?.trace?.length !== 2 + 64 * traceTypes.length) throw new Error(`banana-gun: unexpected swap layout in ${log.transactionHash}`);
    const [tokenIn, tokenOut, feeToken, amountIn, amountOut, fee] = AbiCoder.defaultAbiCoder().decode(traceTypes, log.args.trace)
      .map((value: any) => typeof value === "string" ? value.toLowerCase() : value);
    const feeOnInput = feeToken === tokenIn || (isNative(feeToken) && isNative(tokenIn));
    // amountIn is net of the fee, amountOut is gross of it
    return {
      feeToken,
      fee,
      volumeToken: feeOnInput ? tokenIn : tokenOut,
      volume: feeOnInput ? amountIn + fee : amountOut,
    };
  });
}
