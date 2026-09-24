import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const TREASURY = "0x647128722e6aC0FDF10C1c5bEB9d37C66cE6f907";
const FEE_BPS = 5;

const INK_TOKENS = [
  ADDRESSES.optimism.WETH_1,
  ADDRESSES.ink.USDC,
  ADDRESSES.ink.USDT0,
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: INK_TOKENS,
    targets: [TREASURY],
  });

  const dailyVolume = options.createBalances();
  const feeEntries = dailyFees.getBalances();
  for (const [token, amount] of Object.entries(feeEntries)) {
    dailyVolume.add(token, BigInt(amount) * BigInt(10000) / BigInt(FEE_BPS));
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "Aggregated swap volume on Ink L2, back-calculated from the 0.05% integrator fee collected by the TideSwap treasury on 0x-routed swaps.",
  Fees: "TideSwap charges a 0.05% integrator fee on swaps routed through 0x. LI.FI-routed swaps have no TideSwap fee.",
  Revenue: "100% of fees go to the TideSwap treasury (Gnosis Safe).",
  ProtocolRevenue: "All revenue is protocol revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.INK],
  fetch,
  start: "2025-02-22",
  methodology,
  doublecounted: true
};

export default adapter;
