import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

const poolFactoryAddress = '0xa9d53862D01190e78dDAf924a8F497b4F8bb5163';

const methodology = {
    UserFees: "Users pays 0% of each swap",
    Fees: "Net Trading fees paid is the Sum of fees sent to LP & Protocol Fees",
    Revenue: "A variable % of the trading fee is collected as Protocol Fees.",
    ProtocolRevenue: "100% of Revenue is collected by Protocol Treasury.",
    // HoldersRevenue: "100% of Revenue is used to buyback ELITE.",
    SupplySideRevenue: "The portion of trading fees paid to liquidity providers."
}

const adapters: SimpleAdapter = uniV3Exports({
    [CHAIN.ASSETCHAIN]: { factory: poolFactoryAddress, },
})


Object.keys(adapters.adapter).forEach((chain: any) => {
    adapters.adapter[chain].meta = { methodology }
})
export default adapters;
