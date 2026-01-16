import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Fee recipient contract addresses for Angle protocol
const FEE_RECIPIENT_ADDRESSES = [
  '0x00253582b2a3FE112feEC532221d9708c64cEFAb', // Angle Fee Distributor
  '0x222222fD79264BBE280b4986F6FEfBC3524d0137'  // Additional fee recipient
];

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    // Get all tokens received by fee recipient addresses
    await addTokensReceived({
        options,
        targets: FEE_RECIPIENT_ADDRESSES,
        balances: dailyFees
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2023-08-08',
        },
    },
    version: 2
}

export default adapter;
