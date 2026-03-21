import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

/**
 * PumpSpace V2 DEX Adapter
 * 
 * Factory: 0x26B42c208D8a9d8737A2E5c9C57F4481484d4616
 * 
 * Fee model:
 * - Total swap fee: 0.5% (0.005)
 * - 50% of fee (0.25% = 0.0025) sent to feeTo (protocol treasury)
 * - 50% of fee (0.25% = 0.0025) to LPs as supply-side rewards
 * 
 * Reference (from contract):
 * function calculateFee(uint256 amount, address swapFeeTo) internal view returns (uint256) {
 *     uint256 swapFeeRate = IDexFactory(factory).swapFeeRate(); // 2
 *     if (swapFeeTo != address(0)) {
 *         uint256 feeAmount = (amount * 5) / 1000;  // 0.5%
 *         uint256 feeToReceive = feeAmount / swapFeeRate;  // /2 = 0.25%
 *         return feeToReceive;
 *     }
 * }
 */

const FACTORY_ADDRESS = "0x26B42c208D8a9d8737A2E5c9C57F4481484d4616";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: "Total swap volume collected from PumpSpace V2 factory on Avalanche.",
    Fees: "Total 0.5% swap fee per trade. 50% goes to LPs, 50% to the protocol treasury.",
    UserFees: "Users pay 0.5% per swap.",
    Revenue: "Protocol receives 0.25% of total swap volume as revenue.",
    ProtocolRevenue: "Protocol treasury collects 50% of fees (0.25% of volume).",
    SupplySideRevenue: "Liquidity providers earn the remaining 50% (0.25% of volume).",
  },
  start: "2024-12-23",
  chains: [CHAIN.AVAX],
  fetch: getUniV2LogAdapter({
    factory: FACTORY_ADDRESS,
    fees: 0.005,               // total user fees = 0.5%
    userFeesRatio: 1,          // 100% of 0.5% is paid by user
    revenueRatio: 0.5,         // 50% of total fees go to protocol (0.25%)
    protocolRevenueRatio: 0.5, // 50% of total fees go to protocol treasury
    supplySideRevenueRatio: 0.5, // 50% of total fees go to LPs
  }),
};

export default adapter;
