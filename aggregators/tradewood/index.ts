import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from '../../helpers/coreAssets.json'

// TradeWood / Sherwood Router: splits each swap across Uniswap V2/V3/V4 pools on Robinhood Chain.
// The router holds no user liquidity, so volume and fees are measured from its SherwoodSwap event.
const SHERWOOD_ROUTER = "0x0b93Fb1d8be0EdcA90a7cC3Aea58e6460FE1eB46";
const WETH = ADDRESSES.robinhood.WETH;
const NATIVE = ADDRESSES.null;

const SHERWOOD_SWAP_EVENT =
  "event SherwoodSwap(address indexed user, address indexed referrer, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount, address recipient, uint8 venueMask, uint8 legs)";

const ROUTER_FEES_TO_TREASURY = "Trading Fees To Treasury";

const toPricedToken =(token: string) => (token.toLowerCase() === NATIVE ? WETH : token);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logs = await options.getLogs({ target: SHERWOOD_ROUTER, eventAbi: SHERWOOD_SWAP_EVENT });
  for (const log of logs) {
    const tokenIn = toPricedToken(log.tokenIn);
    dailyVolume.add(tokenIn, log.amountIn);
    dailyFees.add(tokenIn, log.feeAmount, METRIC.TRADING_FEES);
    dailyRevenue.add(tokenIn, log.feeAmount, ROUTER_FEES_TO_TREASURY);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-10-21" },
  },
  methodology: {
    Volume: "Sum of amountIn from SherwoodSwap events emitted by the Sherwood Router.",
    Fees: "Router fee (feeAmount in SherwoodSwap events), charged on the input token.",
    Revenue: "All router fees go to the TradeWood treasury.",
    ProtocolRevenue: "All router fees go to the TradeWood treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Router fee charged on the input token of each swap (feeAmount in SherwoodSwap events).",
    },
    Revenue: {
      [ROUTER_FEES_TO_TREASURY]: "All router fees, kept by the TradeWood treasury.",
    },
    ProtocolRevenue: {
      [ROUTER_FEES_TO_TREASURY]: "All router fees, sent to the TradeWood treasury.",
    },
  },
};

export default adapter;
