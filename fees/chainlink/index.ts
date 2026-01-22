import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived, nullAddress } from '../../helpers/token';
import coreAssets from "../../helpers/coreAssets.json"

const feeAggregator = "0xd6e39d42AceE7Abcc460E6Ea78a0844A0980E78f"
const paymentLayer = "0x5680681ED3767B96914CE741a308155C7fB9171d"
const reserve = "0x9A709B7B69EA42D5eeb1ceBC48674C69E1569eC6"
const stakingRewards = "0xc0E0DE224822B7c47C1f6049991A599486419fF2"

async function fetch(options: FetchOptions) {
    const dailyFees = await addTokensReceived({ options: options, target: feeAggregator})
    const dailyRevenue = await addTokensReceived({ options: options, targets: [reserve, stakingRewards], fromAddressFilter: paymentLayer, token: coreAssets.ethereum.LINK})
    return {
        dailyFees,
        dailyRevenue
    }
}

const adapter : SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: "2025-02-21",
    methodology: {
        "Fees": "All the tokens received by the fee aggregator contract",
        "Revenue": "All the LINK tokens transfered from the PaymentAbstractionLayer to the Reserve and Staking Rewards contracts"
    }
}

export default adapter