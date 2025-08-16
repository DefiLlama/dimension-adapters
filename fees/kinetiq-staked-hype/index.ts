import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const methodology = {
    Fees: 'Total unstaking fees and rewards from staked HYPE.',
    Revenue: 'Total fee through 0.1%  KHYPE unstaking fee',
    ProtocolRevenue: 'All the revenue goes to the treasury.',
};

const KHYPE = '0xfD739d4e423301CE9385c1fb8850539D657C296D';
const KHYPE_STAKING_ACCOUNTANT = '0x9209648Ec9D448EF57116B73A2f081835643dc7A';
const KHYPE_TREASURY = '0x64bD77698Ab7C3Fd0a1F54497b228ED7a02098E3';
const exchangeRateAbi = 'function kHYPEToHYPE(uint256 kHYPEAmount) external view returns (uint256)'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();

    const exchangeRateBefore = await options.fromApi.call({
        target: KHYPE_STAKING_ACCOUNTANT,
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
    }) / 1e18;
    const exchangeRateAfter = await options.toApi.call({
        target: KHYPE_STAKING_ACCOUNTANT,
        abi: exchangeRateAbi,
        params: ['1000000000000000000'],
    }) / 1e18;

    const totalSupply = await options.api.call({
        target: KHYPE,
        abi: 'uint256:totalSupply',
    }) / 1e18;

    dailyFees.addCGToken('hyperliquid', totalSupply * (exchangeRateAfter - exchangeRateBefore));

    const dailyRevenue = await addTokensReceived({
        options,
        token: KHYPE,
        target: KHYPE_TREASURY,
    });

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            start: '2025-07-14',
        },
    },
    methodology,
};

export default adapter;
