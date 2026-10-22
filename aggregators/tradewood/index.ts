import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// TradeWood / Sherwood Router: splits each swap across Uniswap V2/V3/V4 pools on Robinhood Chain.
// The router holds no user liquidity, so volume and fees are measured from its SherwoodSwap event.
const SHERWOOD_ROUTER = "0x0b93Fb1d8be0EdcA90a7cC3Aea58e6460FE1eB46";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const NATIVE = "0x0000000000000000000000000000000000000000";

const SHERWOOD_SWAP_EVENT =
  "event SherwoodSwap(address indexed user, address indexed referrer, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount, address recipient, uint8 venueMask, uint8 legs)";

const toPricedToken = (token: string) => (token.toLowerCase() === NATIVE ? WETH : token);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({ target: SHERWOOD_ROUTER, eventAbi: SHERWOOD_SWAP_EVENT });
  for (const log of logs) {
    const tokenIn = toPricedToken(log.tokenIn);
    dailyVolume.add(tokenIn, log.amountIn);
    dailyFees.add(tokenIn, log.feeAmount);
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
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
};

export default adapter;
