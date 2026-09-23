// DefiLlama DEX volume adapter for Arctide (Arc). Drop-in file for
// https://github.com/DefiLlama/dimension-adapters -> dexs/arctide/index.ts
//
// Volume is the USDC size of every swap through the Arctide Router: grossNative, which is the USDC
// a buyer sent (fees included) or the USDC a sell took out of the pool before fees. The event's
// ammBaseAmount field is zero on the deployed Router (checked on chain, 22 Sep 2026), so it is not used.
// Every pair only accepts swaps from the Router, so SwapExecuted is the complete trade stream,
// limit-order fills included.
// Not flagged doublecounted: Arctide runs its own pools, so no other DefiLlama adapter counts them.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ROUTER = "0xA161f98765b396D126D25C0FF7546F9FCeA9B082";
const USDC = "0x3600000000000000000000000000000000000000";

const SWAP_EXECUTED =
  "event SwapExecuted(address indexed pair, address indexed token, address indexed trader, address recipient, bool isBuy, uint16 totalFeeBps, uint256 grossNative, uint256 ammBaseAmount, uint256 tokenAmount, uint256 lpFeeNative, uint256 protocolFeeNative, uint256 treasuryFeeNative, address protocolRecipient, address treasuryRecipient)";

const toUsdc = (wei: bigint): bigint => wei / 10n ** 12n;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({ target: ROUTER, eventAbi: SWAP_EXECUTED });
  for (const log of logs) dailyVolume.add(USDC, toUsdc(BigInt(log.grossNative)));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Volume: "USDC size of every swap on Arctide pools, read from the Router's SwapExecuted events (grossNative: USDC sent by the buyer, or USDC taken out of the pool by a sell, before fees). Bonding-curve trades on the launchpad are not included yet.",
  },
};

export default adapter;
