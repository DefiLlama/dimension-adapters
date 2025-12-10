import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const burnEventAbi = "event Burn(address sender,bytes32 txid,uint256 vout,bytes32 predecessorTxid,uint256 predecessorVout,uint256 brokerAmount,uint256 brokerFee,bytes32 targetScriptHash)";
const bridgeContract = "0x4b012E8980ed331a626bA2d2E510B20cB54886de";
const yBTCbContract = "0x2cd3CdB3bd68Eea0d3BE81DA707bC0c8743D7335";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances()

    const burnEvents = await options.getLogs({
        target: bridgeContract,
        eventAbi: burnEventAbi
    })

    for (const event of burnEvents) {
        dailyFees.addToken(yBTCbContract, event.brokerFee);
    }

    return { dailyFees, dailyRevenue: options.createBalances(), dailySupplySideRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "2025-07-14",
        }
    },
    methodology: {
        Fees: "A 0.0001 BTC service fee is charged on withdrawals.",
        Revenue: "The protocol does not collect revenue from the YBTC bridge fees.",
        SupplySideRevenue: "All BitVM2 YBTC bridge fees are paid to brokers who provide liquidity to facilitate withdrawals."
    }
}

export default adapter;