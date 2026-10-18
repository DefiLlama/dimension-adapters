import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// FlowRouter on Robinhood Chain. One Swap event is emitted after each successful settlement.
// https://robinhoodchain.blockscout.com/address/0x8ad60fae44dd6aafd8a98b7f25ead026013efdf2
const ROUTER = "0x8ad60fae44dd6aafd8a98b7f25ead026013efdf2";
const NATIVE = "0x0000000000000000000000000000000000000000";
const SWAP = "event Swap(address indexed sender, uint256 inputAmount, address indexed inputToken, uint256 amountOut, address indexed outputToken, int256 slippage, uint32 referralCode, address to)";
const VOLUME = "Settled Swaps";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();
  const logs = await getLogs({ targets: [ROUTER], eventAbi: SWAP });

  for (const log of logs) {
    // Count the actual input once, including fee-on-transfer inputs as recorded by the router.
    // Do not add the output or downstream venue fills for the same swap.
    if (log.inputToken.toLowerCase() === NATIVE)
      dailyVolume.addGasToken(log.inputAmount, VOLUME);
    else
      dailyVolume.add(log.inputToken, log.inputAmount, VOLUME);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  // The earliest settlement date has not been established; do not invent a start date.
  methodology: {
    Volume: "Actual input amounts from successful FlowRouter Swap events on Robinhood Chain, counted once per swap. Native ETH is priced as the chain's gas token. Downstream venue fills and swap outputs are not added. Fees and revenue are outside this volume-only adapter.",
  },
  breakdownMethodology: {
    Volume: {
      [VOLUME]: "The inputToken and inputAmount recorded by the router for each settled swap in the requested time window.",
    },
  },
};

export default adapter;
