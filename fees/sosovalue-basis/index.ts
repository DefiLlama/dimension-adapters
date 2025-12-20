import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "@defillama/sdk/build/util/coins";

const USSI_CONTRACT = '0x3a46ed8FCeb6eF1ADA2E4600A522AE7e24D2Ed18';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const totalSupplyBeforeRaw = await options.fromApi.call({
        abi: "erc20:totalSupply",
        target: USSI_CONTRACT,
        permitFailure: false,
    })
    const totalSupplyStart = Number(totalSupplyBeforeRaw as string) / 1e8

    const priceEndRes = await getPrices([`base:${USSI_CONTRACT}`], options.toTimestamp)
    const priceStartRes = await getPrices([`base:${USSI_CONTRACT}`], options.fromTimestamp)

    const priceEnd = priceEndRes[`base:${USSI_CONTRACT}`]?.price
    const priceStart = priceStartRes[`base:${USSI_CONTRACT}`]?.price

    const daysFraction = (options.toTimestamp - options.fromTimestamp) / 86400;

    const yieldAmount = (priceEnd - priceStart) * totalSupplyStart
    const serviceFee = (priceStart * totalSupplyStart) * 0.0001 * daysFraction
    dailyFees.addUSDValue(yieldAmount + serviceFee);
    dailyRevenue.addUSDValue(serviceFee);
    dailySupplySideRevenue.addUSDValue(yieldAmount);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailyHoldersRevenue: 0,
        dailySupplySideRevenue,
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
        HoldersRevenue: 'No holder revenue, only emissions as staking rewards',
        SupplySideRevenue: 'Total yield accrued through USSI price appreciation, distributed to USSI holders',
    },
};
