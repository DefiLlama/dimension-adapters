import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import * as sdk from "@defillama/sdk";
import { sleep } from "../../utils/utils";

const USSI_PRICE_ID = 'base:0x3a46ed8FCeb6eF1ADA2E4600A522AE7e24D2Ed18';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const totalSupply = await options.fromApi.call({ abi: "uint256:totalSupply", target: '0x3a46ed8FCeb6eF1ADA2E4600A522AE7e24D2Ed18' })

    await sleep(2)
    const priceEndRes = await sdk.coins.getPrices([USSI_PRICE_ID], options.toTimestamp)
    await sleep(2)
    const priceStartRes = await sdk.coins.getPrices([USSI_PRICE_ID], options.fromTimestamp)

    const priceEnd = priceEndRes[USSI_PRICE_ID].price
    const priceStart = priceStartRes[USSI_PRICE_ID].price
    
    if (!priceEnd || !priceStart) {
      throw Error(`failed to get prices for ${USSI_PRICE_ID} at ${options.fromTimestamp} and ${options.toTimestamp}`)
    }

    const daysFraction = (options.toTimestamp - options.fromTimestamp) / 86400;

    const yieldAmount = (priceEnd - priceStart) * totalSupply / 1e18
    const serviceFee = priceStart * totalSupply * 0.0001 * daysFraction / 1e18

    dailyFees.addUSDValue(yieldAmount, METRIC.ASSETS_YIELDS);
    dailyFees.addUSDValue(serviceFee, METRIC.MANAGEMENT_FEES);

    dailyRevenue.addUSDValue(serviceFee, METRIC.MANAGEMENT_FEES);
    dailySupplySideRevenue.addUSDValue(yieldAmount, METRIC.ASSETS_YIELDS);

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailyHoldersRevenue: 0,
    };
};

export default {
    version: 2,
    allowNegativeValue: true, // Yield strategies aren't risk-free
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: '2024-12-27',
        }
    },
    methodology: {
        Fees: 'Yield generated from delta hedging strategies plus daily service fee of 0.01% based on the value of the underlying assets.',
        Revenue: 'All services fees paid by users.',
        ProtocolRevenue: 'All services fees are collected by SoSoValue protocol.',
        HoldersRevenue: 'No revenue share to SOSO token holders.',
        SupplySideRevenue: 'Total yield accrued through USSI price appreciation, distributed to USSI holders',
    },
    breakdownMethodology : {
        Fees: {
            [METRIC.ASSETS_YIELDS]: "Yields generated from delta hedging strategies",
            [METRIC.MANAGEMENT_FEES]: "Management fees applied on TVL",
        },
        Revenue: {
            [METRIC.MANAGEMENT_FEES]: "Management fees applied on TVL",
        },
        SupplySideRevenue: {
            [METRIC.ASSETS_YIELDS]: "Yields generated from delta hedging strategies",
        },
        ProtocolRevenue: {
            [METRIC.MANAGEMENT_FEES]: "Management fees applied on TVL",
        }
    }
};
