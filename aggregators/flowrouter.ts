import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// FlowRouter on Robinhood Chain. One Swap event is emitted after each successful settlement.
// https://robinhoodchain.blockscout.com/address/0x8ad60fae44dd6aafd8a98b7f25ead026013efdf2
const ROUTER = "0x8ad60fae44dd6aafd8a98b7f25ead026013efdf2";
const SWAP = "event Swap(address indexed sender, uint256 inputAmount, address indexed inputToken, uint256 amountOut, address indexed outputToken, int256 slippage, uint32 referralCode, address to)";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();
  const logs = await getLogs({ targets: [ROUTER], eventAbi: SWAP });

  for (const log of logs) {
    dailyVolume.add(log.inputToken, log.inputAmount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  // First successful FlowRouter Swap event: block 24335437, 2026-07-31 16:52:32 UTC.
  start: '2026-07-31',
  methodology: {
    Volume: "Actual input amounts from successful FlowRouter Swap events on Robinhood Chain, counted once per swap. Native ETH is priced as the chain's gas token. Downstream venue fills and swap outputs are not added. Fees and revenue are outside this volume-only adapter.",
  },
};

export default adapter;
