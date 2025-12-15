import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token"
import CoreAssets from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const management = '0x96ABd1C04882BCe372203d43649be525F8AE87ba'
const usdc = CoreAssets.ethereum.USDC

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const feeAddress = await options.api.call({
        abi: "address:platformFeeAddress",
        target: management
    });
    const transfers = await addTokensReceived({
        options,
        tokens: [usdc],
        target: feeAddress
    })
    dailyFees.addBalances(transfers, METRIC.MINT_REDEEM_FEES)
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyUserFees: dailyFees,
    }
}
const adapters : SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2024-01-08',
    methodology: {
        Fees: "Platform fees on subscription and redemption of tokens",
        Revenue: "Platform fees paid by users on subscription and redemption",
        UserFees: "Platform fees paid by users on subscription and redemption",
    }
};
export default adapters;