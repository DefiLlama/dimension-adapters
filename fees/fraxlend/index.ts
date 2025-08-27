import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const FRAXLEND_FACTORY = {
    "ethereum": "0xD6E9D27C75Afd88ad24Cd5EdccdC76fd2fc3A751",
    "arbitrum": "0x0bD2fFBcB0A17De2d5a543ec2D47C772eeaD316d",
    "fraxtal": "0x8c22EBc8f9B96cEac97EA21c53F3B27ef2F45e57"
};

const FUNCTION_ABI = {
    BORROW_ASSET: "function asset() view returns (address)",
    ALL_PAIRS: "function getAllPairAddresses() view returns (address[])"
};

const EVENT_ABI = {
    ADD_INTEREST: "event AddInterest(uint256 interestEarned, uint256 rate, uint256 deltaTime, uint256 feesAmount, uint256 feesShare)",
    ADD_INTEREST2: "event AddInterest(uint256 interestEarned, uint256 rate, uint256 feesAmount, uint256 feesShare)",
    LIQUIDATION: "event Liquidate (address indexed borrower, uint256 collateralForLiquidator, uint256 sharesToLiquidate, uint256 amountLiquidatorToRepay, uint256 feesAmount, uint256 sharesToAdjust, uint256 amountToAdjust)"
};

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const allPairs = await options.api.call({
        target: FRAXLEND_FACTORY[options.chain],
        abi: FUNCTION_ABI.ALL_PAIRS,
    });

    await Promise.all(
        allPairs.map(async (pairAddress: string) => {
            const [asset, interestOccuralLogs1, interestOccuralLogs2, liquidationLogs] = await Promise.all([
                options.api.call({
                    target: pairAddress,
                    abi: FUNCTION_ABI.BORROW_ASSET,
                }),
                options.getLogs({
                    target: pairAddress,
                    eventAbi: EVENT_ABI.ADD_INTEREST,
                }),
                options.getLogs({
                    target: pairAddress,
                    eventAbi: EVENT_ABI.ADD_INTEREST2,
                }),
                options.getLogs({
                    target: pairAddress,
                    eventAbi: EVENT_ABI.LIQUIDATION,
                })
            ]);

            const interestOccuralLogs =
                interestOccuralLogs1.length > 0 ? interestOccuralLogs1 : interestOccuralLogs2;

            interestOccuralLogs.forEach((interest) => {
                dailySupplySideRevenue.add(asset, interest.interestEarned);
                dailyRevenue.add(asset, interest.feesAmount);
            });

            liquidationLogs.forEach(liquidation => {
                dailyFees.add(asset, liquidation.feesAmount);
            });
        })
    );

    dailyFees.add(dailyRevenue);
    dailyFees.add(dailySupplySideRevenue);
    
    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue
    };
}

const methodology = {
    Fees: 'Includes Lenders interest, liquidation fee and 10% interest fee',
    Revenue: '10% interest fee is considered as revenue',
    SupplySideRevenue: 'All the interest earned by lenders'
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.FRAXTAL],
    start: '2022-02-11',
    methodology,
};

export default adapter;