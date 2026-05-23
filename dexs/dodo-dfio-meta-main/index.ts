/**
 * DODO DVM swap volume on dfio_meta_main (chain 138) via on-chain DODOSwap logs.
 * Use when api.dodoex.io GraphQL lacks volume.dfio_meta_main (see probe script).
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const POOLS = [
  "0x9e89bAe009adf128782E19e8341996c596ac40dC",
  "0x866Cb44b59303d8dc5f4F9E3E7A8e8b0bf238d66",
  "0xc39B7D0F40838cbFb54649d327f49a6DAC964062",
  "0x67049e7333481e2cac91af61403ac7bddfab7bcd",
  "0x72f1a0794153c3b8a1e8a731f1d8e1a52cb10dc5",
  "0xb53a0508940b1ff90f1aad4f6cb50a7012fe5593",
  "0xe227f6c0520c0c6e8786fe56fa76c4914f861533",
  "0xf3e8a07d419b61f002114e64d79f7cf8f7989433",
];

const STABLES = new Set([
  "0x93e66202a11b1772e55407b32b44e5cd8eda7f22",
  "0xf22258f57794cc8e06237084b353ab30fffa640b",
  "0x004b63a7b5b0e06f6bb6adb4a5f9f590bf3182d1",
  "0x71d6687f38b93ccad569fa6352c876eea967201b",
].map((a) => a.toLowerCase()));

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".toLowerCase();
const CBTC = "0xe94260c555ac1d9d3cc9e1632883452ebdf0082e".toLowerCase();

const SWAP_ABI =
  "event DODOSwap(address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address trader, address receiver)";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  for (const pool of POOLS) {
    const logs = await options.getLogs({
      target: pool,
      eventAbi: SWAP_ABI,
    });
    for (const log of logs) {
      const from = (log.fromToken as string).toLowerCase();
      const to = (log.toToken as string).toLowerCase();
      const amtIn = log.fromAmount as bigint;
      const amtOut = log.toAmount as bigint;
      if (STABLES.has(from)) {
        dailyVolume.add(from, amtIn);
        dailyFees.add(from, (amtIn * 3n) / 1000n);
      } else if (STABLES.has(to)) {
        dailyVolume.add(to, amtOut);
        dailyFees.add(to, (amtOut * 3n) / 1000n);
      } else if (from === WETH || to === WETH) {
        const ethAmt = from === WETH ? amtIn : amtOut;
        dailyVolume.add(WETH, ethAmt);
        dailyFees.add(WETH, (ethAmt * 3n) / 1000n);
      } else if (from === CBTC || to === CBTC) {
        const btcAmt = from === CBTC ? amtIn : amtOut;
        dailyVolume.add(CBTC, btcAmt);
        dailyFees.add(CBTC, (btcAmt * 3n) / 1000n);
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.DFIO_META_MAIN]: {
      fetch,
      start: "2025-01-01",
    },
  },
  methodology: {
    Volume:
      "Sum of DODOSwap fromAmount (stable legs at face USD proxy) on canonical DVM pools on dfio_meta_main.",
    Fees: "Estimated 0.3% of notional on stable/WETH/cBTC legs until per-pool _LP_FEE_RATE_ is wired.",
    UserFees: "Swap fees paid by traders.",
    Revenue: "Protocol fee share not split on-chain in this adapter — reported as 0 until DODO fee API supports 138.",
    ProtocolRevenue: "0 pending DODO gateway chain-scoped fee data.",
    SupplySideRevenue: "LP fee share approximated as full fees until gateway supports dfio_meta_main.",
  },
};

export default adapter;
