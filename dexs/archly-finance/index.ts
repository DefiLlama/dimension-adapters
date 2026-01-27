import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.TELOS]: {
            fetch: getUniV2LogAdapter({ factory: '0x39fdd4Fec9b41e9AcD339a7cf75250108D32906c' }),
        }
    },
    methodology: {
        Fees: "The trading fees are 0.05%, and can be adjusted from 0.01% up to 0.1%.",
        UserFees: "Currently users pay a trading fee of 0.05%.",
        HoldersRevenue: "veArc voters receive all protocol fees.",
        Revenue: "All trading fees are paid to veArc voters.",
        SupplySideRevenue: "LPs do not earn any revenue from trading fees, only Arc emission decided by veArc voters.",
        ProtocolRevenue: "Treasury does not earn any revenue from trading fees."
    }
};

export default adapter;
