import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

/**
 * AllBlue V2 DEX Adapter
 *
 * Legacy PumpSpace V2:
 * - Factory: 0x26B42c208D8a9d8737A2E5c9C57F4481484d4616
 * - Fee: 0.5% (50% protocol / 50% LP)
 *
 * Current AllBlue V2:
 * - Factory: 0x6FEa5651FaC99b854A961dbB41380AdB9F8F9a8b
 * - Fee: 0.3% (50% protocol / 50% LP)
 *
 * The legacy deployment remains included for historical and remaining activity.
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

const LEGACY_FACTORY_ADDRESS =
  "0x26B42c208D8a9d8737A2E5c9C57F4481484d4616";

const ALLBLUE_FACTORY_ADDRESS =
  "0x6FEa5651FaC99b854A961dbB41380AdB9F8F9a8b";

const legacyFetch = getUniV2LogAdapter({
  factory: LEGACY_FACTORY_ADDRESS,
  fees: 0.005,
  userFeesRatio: 1,
  revenueRatio: 0.5,
  protocolRevenueRatio: 0.5,
});

const allBlueFetch = getUniV2LogAdapter({
  factory: ALLBLUE_FACTORY_ADDRESS,
  fees: 0.003,
  userFeesRatio: 1,
  revenueRatio: 0.5,
  protocolRevenueRatio: 0.5,
  allowReadPairs: true,
});

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: "Total swap volume from the legacy PumpSpace V2 and current AllBlue V2 deployments on Avalanche.",
    Fees: "Legacy PumpSpace V2 charges a 0.5% swap fee and AllBlue V2 charges a 0.3% swap fee. Both split fees 50% to LPs and 50% to the protocol treasury.",
    UserFees: "Users pay 0.5% on legacy PumpSpace V2 and 0.3% on AllBlue V2.",
    Revenue: "The protocol receives 50% of swap fees from both V2 deployments.",
    ProtocolRevenue: "The protocol treasury receives 50% of swap fees.",
    SupplySideRevenue: "Liquidity providers receive the remaining 50% of swap fees.",
  },
  start: "2024-12-23",
  chains: [CHAIN.AVAX],

  fetch: async (options) => {
    const legacy: any = await legacyFetch(options);
    const allBlue: any = await allBlueFetch(options);

    legacy.dailyVolume.add(allBlue.dailyVolume);
    legacy.dailyFees.add(allBlue.dailyFees);
    legacy.dailyUserFees.add(allBlue.dailyUserFees);
    legacy.dailyRevenue.add(allBlue.dailyRevenue);
    legacy.dailyProtocolRevenue.add(allBlue.dailyProtocolRevenue);
    legacy.dailySupplySideRevenue.add(allBlue.dailySupplySideRevenue);

    return legacy;
  },
};

export default adapter;
