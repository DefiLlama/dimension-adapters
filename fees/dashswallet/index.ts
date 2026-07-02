import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SWAP_EXECUTED =
    "event SwapExecuted(address indexed user, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 destAmount, uint256 surplus, uint256 protocolFee, uint256 cashback, address router)";

const CONTRACTS: Record<string, string[]> = {
    // https://etherscan.io/address/0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c
    // https://etherscan.io/address/0x024cceeca9852c3d486192f38d0c37a3296c6449
    // https://etherscan.io/address/0xf129abaa92feb1689f0b9d1f664d395c60d41512
    [CHAIN.ETHEREUM]: [
        "0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c",
        "0x024cceeca9852c3d486192f38d0c37a3296c6449",
        "0xf129abaa92feb1689f0b9d1f664d395c60d41512",
    ],
    // https://optimistic.etherscan.io/address/0x79191c6647b05fd98f53c9db0861145739eac4e6
    // https://optimistic.etherscan.io/address/0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c
    // https://optimistic.etherscan.io/address/0xbbb89263e7fee2b6590663f72bcff18e401fd103
    [CHAIN.OPTIMISM]: [
        "0x79191c6647b05fd98f53c9db0861145739eac4e6",
        "0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c",
        "0xbbb89263e7fee2b6590663f72bcff18e401fd103",
    ],
    // https://polygonscan.com/address/0x54f33b724ebf94673f843572f7b1d5edcb19615e
    // https://polygonscan.com/address/0x4123125394b21aae3061e253b60bd79c58a25049
    // https://polygonscan.com/address/0x283d20ee2c5263bc14b83dd9d8c21bae79d3dd2a
    [CHAIN.POLYGON]: [
        "0x54f33b724ebf94673f843572f7b1d5edcb19615e",
        "0x4123125394b21aae3061e253b60bd79c58a25049",
        "0x283d20ee2c5263bc14b83dd9d8c21bae79d3dd2a",
    ],
    // https://basescan.org/address/0xa7a7747172f39130f9a59dce68585771702f05fd
    // https://basescan.org/address/0xddd43135a896cc864066ace33af03ba3bb6e8c51
    // https://basescan.org/address/0x89f5fbeafb2bac8a1b47b901d67d178c4362e796
    [CHAIN.BASE]: [
        "0xa7a7747172f39130f9a59dce68585771702f05fd",
        "0xddd43135a896cc864066ace33af03ba3bb6e8c51",
        "0x89f5fbeafb2bac8a1b47b901d67d178c4362e796",
    ],
    // https://arbiscan.io/address/0x7c4313534824776303e623d9a804688481e01aa8
    // https://arbiscan.io/address/0xaabb8ce890ae0e84b19cf9eac191b0b865cdfad3
    // https://arbiscan.io/address/0x5091719f1300aefd20d5c7771861bfd5d0424c82
    [CHAIN.ARBITRUM]: [
        "0x7c4313534824776303e623d9a804688481e01aa8",
        "0xaabb8ce890ae0e84b19cf9eac191b0b865cdfad3",
        "0x5091719f1300aefd20d5c7771861bfd5d0424c82",
    ],
    // https://snowtrace.io/address/0x577c6502d4a8596c559d8da0f32204244276d088
    // https://snowtrace.io/address/0x05278a9d046c30dae9cc1eff2274ce77de77fa96
    // https://snowtrace.io/address/0x0e6aa9230e59c24d2dec876fecb004582ee1aa8e
    [CHAIN.AVAX]: [
        "0x577c6502d4a8596c559d8da0f32204244276d088",
        "0x05278a9d046c30dae9cc1eff2274ce77de77fa96",
        "0x0e6aa9230e59c24d2dec876fecb004582ee1aa8e",
    ],
};

const breakdownMethodology = {
    Fees: {
        "Swap Surplus": "Difference between actual swap output and the user's minimum accepted amount across Aave collateral/debt swaps.",
    },
    Revenue: {
        "Swap Surplus To Treasury": "Portion of surplus retained by the DashsWallet treasury after deducting cashback.",
    },
    SupplySideRevenue: {
        "Swap Surplus Cashback To User": "Portion of surplus returned to the swap-initiating user as cashback.",
    },
};


const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const logs = await options.getLogs({
        targets: CONTRACTS[options.chain],
        eventAbi: SWAP_EXECUTED,
        flatten: true,
    });

    for (const log of logs) {
        dailyFees.add(log.srcToken, log.surplus, "Swap Surplus");
        dailyRevenue.add(log.srcToken, log.protocolFee, "Swap Surplus To Treasury");
        dailySupplySideRevenue.add(log.srcToken, log.cashback, "Swap Surplus Cashback To User");
    }

    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: Object.keys(CONTRACTS),
    start: "2026-06-27",
    methodology: {
        Fees: "Total surplus captured on Aave collateral/debt swaps — difference between actual swap output and the user's minimum accepted amount.",
        Revenue: "Portion of surplus retained by the DashsWallet treasury after deducting cashback.",
    },
    breakdownMethodology,
};

export default adapter;