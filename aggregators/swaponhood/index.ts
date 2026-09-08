import { FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

// SwapOnHood: DEX aggregator on Robinhood Chain (swaponhood.com). Every swap emits Swapped on the aggregator.
const abi = "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint8 venue)";
const ZERO = ADDRESSES.null;
const WETH = ADDRESSES.robinhood.WETH;
const AGGREGATORS = [
  "0x534D03e9c8443eA7c64C918b82C28c2873C079d6",
  "0xE4dfD3991f329EE0Ce18b0EB2F9Dc5919244DB47",
];

const FEE_LABEL = "Swap Fees";
const REVENUE_LABEL = "Swap Fees To Protocol";

const fetch: FetchV2 = async ({ getLogs, createBalances }) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const logs = await getLogs({ targets: AGGREGATORS, eventAbi: abi });
  logs.forEach((log: any) => {
    if (log.tokenOut === ZERO) dailyVolume.addGasToken(log.amountOut);
    else dailyVolume.add(log.tokenOut, log.amountOut);
    // the fee is taken in ETH when ETH/WETH is on either side, otherwise in the output token
    const isEth = (a: string) => a === ZERO || a.toLowerCase() === WETH.toLowerCase();
    if (isEth(log.tokenIn) || isEth(log.tokenOut)) {
      dailyFees.addGasToken(log.fee, FEE_LABEL);
      dailyRevenue.addGasToken(log.fee, REVENUE_LABEL);
      dailyProtocolRevenue.addGasToken(log.fee, REVENUE_LABEL);
    } else {
      dailyFees.add(log.tokenOut, log.fee, FEE_LABEL);
      dailyRevenue.add(log.tokenOut, log.fee, REVENUE_LABEL);
      dailyProtocolRevenue.add(log.tokenOut, log.fee, REVENUE_LABEL);
    }
  });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-09-05" },
  },
  methodology: {
    Volume: "Output amount of every swap routed through the SwapOnHood aggregator contracts.",
    Fees: "0.25% protocol fee per swap, taken in ETH when ETH/WETH is on either side, otherwise in the output token.",
    Revenue: "All fees (0.25% of the swap volume) go to the protocol treasury.",
    ProtocolRevenue: "All swap fees(0.25% of the swap volume) are retained by the protocol treasury.",
  },
  breakdownMethodology: {
    Fees: { [FEE_LABEL]: "0.25% protocol fee per swap routed through SwapOnHood." },
    Revenue: { [REVENUE_LABEL]: "0.25% protocol fee per swap, retained by the protocol treasury." },
    ProtocolRevenue: { [REVENUE_LABEL]: "0.25% protocol fee per swap, retained by the protocol treasury." },
  },
};

export default adapter;
