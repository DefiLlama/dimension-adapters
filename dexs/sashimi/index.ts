import { AbiCoder } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Sashimi (sashimi.fun) - USDC-native bonding-curve launchpad on Arc. Docs: sashimi.fun/docs.
// One shared CurveEngine contract handles every token's curve (not one contract per
// token, unlike Pons/SolonPad) - users trade directly against it.
// https://explorer.arc.io/address/0x5b7bf9bd9c35a845ec1d469ed58616e7076a6f5c
const CURVE_ENGINE = "0x5b7bf9bd9c35a845ec1d469ed58616e7076a6f5c";
const USDC = ADDRESSES.arc.USDC;

// The trade event's real name is unknown (Sashimi's contracts are not verified/
// source-published anywhere reachable), so this is matched by its raw topic0 hash
// rather than an `eventAbi` string - an eventAbi requires guessing the exact event
// name too, since the name feeds the topic hash even though it never affects decoding.
// Field order verified word-by-word against a real sell (tx 0xd6123de2...): word1
// (quoteAmount) matched the public API's reported usdc value exactly (101527743 raw
// == 101.527743 usdc), word2 (fee) was exactly 1% of word1 (the docs' stated total
// curve fee), and word3 (tokenAmount) matched the token amount in the paired ERC20
// Transfer log exactly.
const CURVE_TRADE_TOPIC = "0xa1f66e4bd561f4970224fa6654fa58993ac36dfd2b13479a293eba20756cff8c";
const abiCoder = AbiCoder.defaultAbiCoder();
const TRADE_DATA_TYPES = ["bool", "uint256", "uint256", "uint256", "uint256", "uint256"];

function decodeTrade(log: any) {
  const [isBuy, quoteAmount, fee, tokenAmount, quoteReserveAfter, tokenReserveAfter] = abiCoder.decode(TRADE_DATA_TYPES, log.data);
  return { isBuy, quoteAmount, fee, tokenAmount, quoteReserveAfter, tokenReserveAfter };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const trades = await options.getLogs({
    target: CURVE_ENGINE,
    topic: CURVE_TRADE_TOPIC,
    entireLog: true,
  });
  for (const log of trades) {
    const { quoteAmount } = decodeTrade(log);
    // quoteAmount is the gross USDC leg of the trade before fee deduction on both
    // sides (verified: a sell's quoteAmount matched the API's pre-fee usdc figure).
    dailyVolume.add(USDC, quoteAmount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-16",
  methodology: {
    Volume: "Gross USDC value of every buy and sell on Sashimi bonding curves. Excludes graduated-pool trading on Uniswap v3, which is not yet tracked here (only one token has graduated so far).",
  },
};

export default adapter;
