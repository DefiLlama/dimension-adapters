/*
decode event

*/

import { FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

interface IPool {
    coinPoolAddress: string;
    insurancePoolAddress: string;
    ism2InsuranceAddress: string;

}

const ismInsuranceAbis = {
    "totalSetPay": "function totalSetPay(uint256) view returns (uint256 orderID, uint256 poolUsdtAmount, uint256 reservoirUsdtAmount, uint256 reservoirMarqAmount, uint256 poolUsdtFee)",
    "ismOrder": "function ismOrder(uint256) view returns (address initOwner, address collateral, uint256 amount, address productAddress, uint256 productPrice, uint256 makeTime, uint256 expirationTime, uint8 kind, uint256 multiple, uint256 salt, uint256 sideProductOrderValue, uint256 tokenToNEIPrice)",
    "manageFeeRate": "function manageFeeRate() view returns (uint256)"
}


const buyIsmInsuranceEvent = "event BuyISMInsurance(address user, address ism2Addr, address addr721, uint256 orderID, uint256 tokenID)"

const MARQUE_CONTRACTS: { [key: string]: IPool } = {
    [CHAIN.ARBITRUM]: {
        coinPoolAddress: '0x304829862C52BB4A4066e0085395E93439FAC657',
        insurancePoolAddress: '0x5387733F5f457541a671Fe02923F146b4040530C',
        ism2InsuranceAddress: '0xa24a56A55e67A8442e71252F31344Aeb4C71ef8a', // Fixed spacing

    },
    // Add more chains here easily:
    // [CHAIN.ETHEREUM]: { ... },
    // [CHAIN.POLYGON]: { ... },
}


async function getContractCall(target: string, abi: string, params: any[], chain: string) {
    return await sdk.api2.abi.call({
        target,
        abi,
        params,
        chain
    });
}


// Helper function to fetch and calculate fees from insurance orders
async function getInsuranceOrderValue(
    options: FetchOptions,
    contracts: IPool
): Promise<bigint> {
    const buyIsmInsuranceLogs = await options.getLogs({
        target: contracts.ism2InsuranceAddress,
        eventAbi: buyIsmInsuranceEvent
    });

    const orderIDs = buyIsmInsuranceLogs.map(log => log.orderID);
    let totalOrderValues = 0n;
    const baseRate = 1000000n;
    const baseMultiplier = 10000n

    for (const orderID of orderIDs) {
        try {
            const orderInstance = await getContractCall(
                contracts.ism2InsuranceAddress,
                ismInsuranceAbis['ismOrder'],
                [orderID],
                options.chain
            );

            const orderValue = BigInt(orderInstance.amount) * BigInt(orderInstance.multiple) / baseRate / baseMultiplier;

            if (orderValue > 0n) {
                totalOrderValues += orderValue;
            }
        } catch (error) {
            console.log(`Error fetching ismOrder for orderID ${orderID}:`, error);
        }
    }

    return totalOrderValues;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
    const { chain, startTimestamp, endTimestamp, toTimestamp } = options

    if (!MARQUE_CONTRACTS[chain]) {
        throw new Error(`Chain ${chain} not supported`)
    }

    const contracts = MARQUE_CONTRACTS[chain]

    const values = await getInsuranceOrderValue(options, contracts)

    return { 
        timestamp: options.toTimestamp,
        dailyVolume: values.toString() 
    };
};


export default {
    version: 2,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-12-01',
        }
    }
};

