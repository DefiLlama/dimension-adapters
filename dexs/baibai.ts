import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// BaiBai PropAMM on Base: makers post curves on-chain and every taker swap goes through
// BaibaiEntrypoint.swapExactAmountIn, which emits one Fill per swap.
// Addresses: https://docs.baibai.cx
const ENTRYPOINT = "0x98c1D9E102Eb2806D902b13186BDc7892aC4fFBa";

// Fill emitted by the original implementation (deployed 2026-09-05).
const fillV1Abi = "event Fill(address indexed base, uint64 indexed fillSeq, address indexed taker, address tokenIn, uint256 amountIn, uint256 amountOut)";
// Fill emitted since the taker-fee upgrade (Safe tx 0xd94ac5ecaab6f3605b268d0aa678590caf02aee3dfd1251b91e0f49c1286a203, block 51131912).
const fillV2Abi = "event Fill(address indexed base, uint64 indexed fillSeq, address indexed taker, address tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const [v1Fills, v2Fills] = await Promise.all([
    options.getLogs({ target: ENTRYPOINT, eventAbi: fillV1Abi }),
    options.getLogs({ target: ENTRYPOINT, eventAbi: fillV2Abi }),
  ]);
  // amountIn is the full amount the taker paid, so volume is gross of any fee.
  for (const fill of [...v1Fills, ...v2Fills]) dailyVolume.add(fill.tokenIn, fill.amountIn);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-09-05",
  methodology: {
    Volume: "Sum of the input amount of every Fill event emitted by the BaibaiEntrypoint contract, one side per swap.",
  },
};

export default adapter;
