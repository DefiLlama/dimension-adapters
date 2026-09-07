import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// SwapOnHood: DEX aggregator on Robinhood Chain (swaponhood.com). Every swap emits Swapped on the aggregator.
const abi = "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint8 venue)";
const ZERO = "0x0000000000000000000000000000000000000000";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const AGGREGATORS = [
  "0x534D03e9c8443eA7c64C918b82C28c2873C079d6",
  "0xE4dfD3991f329EE0Ce18b0EB2F9Dc5919244DB47",
];

const fetch: FetchV2 = async ({ getLogs, createBalances }) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const logs = await getLogs({ targets: AGGREGATORS, eventAbi: abi });
  logs.forEach((log: any) => {
    if (log.tokenOut === ZERO) dailyVolume.addGasToken(log.amountOut);
    else dailyVolume.add(log.tokenOut, log.amountOut);
    // the fee is taken in ETH when ETH/WETH is on either side, otherwise in the output token
    const isEth = (a: string) => a === ZERO || a.toLowerCase() === WETH.toLowerCase();
    if (isEth(log.tokenIn) || isEth(log.tokenOut)) dailyFees.addGasToken(log.fee);
    else dailyFees.add(log.tokenOut, log.fee);
  });
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-09-05" },
  },
  methodology: {
    Volume: "Output amount of every swap routed through the SwapOnHood aggregator contracts.",
    Fees: "0.25% protocol fee per swap, taken in ETH when ETH/WETH is on either side, otherwise in the output token.",
    Revenue: "All fees go to the protocol treasury.",
  },
};

export default adapter;
