import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token"
import CoreAssets from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

// This is the platform fee address set in the management contract: https://etherscan.io/address/0x96ABd1C04882BCe372203d43649be525F8AE87ba#readContract#F36
const feeAddress = '0x348826f471b63c4C9C393B885E595BA1e2AFf3F5'

const usdc = CoreAssets.ethereum.USDC

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
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
        Revenue: "Platform fees from users",
        UserFees: "Platform fees",
    }
};
export default adapters;