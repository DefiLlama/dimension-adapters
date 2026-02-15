import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived, nullAddress } from '../../helpers/token';
import coreAssets from "../../helpers/coreAssets.json"
import { METRIC } from "../../helpers/metrics";

const feeAggregator = "0xd6e39d42AceE7Abcc460E6Ea78a0844A0980E78f"
const paymentLayer = "0x5680681ED3767B96914CE741a308155C7fB9171d"
const reserve = "0x9A709B7B69EA42D5eeb1ceBC48674C69E1569eC6"
const stakingRewards = "0xc0E0DE224822B7c47C1f6049991A599486419fF2"

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const feeBalance = await addTokensReceived({ options: options, target: feeAggregator})
    dailyFees.addBalances(feeBalance, METRIC.SERVICE_FEES);

    const dailyRevenue = options.createBalances();
    const reserveRevenue = await addTokensReceived({ options: options, targets: [reserve], fromAddressFilter: paymentLayer, token: coreAssets.ethereum.LINK})
    const stakingRevenue = await addTokensReceived({ options: options, targets: [stakingRewards], fromAddressFilter: paymentLayer, token: coreAssets.ethereum.LINK})
    dailyRevenue.addBalances(reserveRevenue, "Protocol Reserve");
    dailyRevenue.addBalances(stakingRevenue, "Staking Rewards");
    return {
        dailyFees,
        dailyRevenue
    }
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SERVICE_FEES]: 'Fees paid by users for Chainlink oracle data feed services, collected through the fee aggregator contract'
    },
    Revenue: {
        "Protocol Reserve": 'LINK tokens transferred from the Payment Abstraction Layer to the protocol reserve contract',
        "Staking Rewards": 'LINK tokens transferred from the Payment Abstraction Layer to the staking rewards contract for distribution to node operators'
    }
};

const adapter : SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: "2025-02-21",
    methodology: {
        "Fees": "All the tokens received by the fee aggregator contract",
        "Revenue": "All the LINK tokens transferred from the PaymentAbstractionLayer to the Reserve and Staking Rewards contracts"
    },
    breakdownMethodology
}

export default adapter