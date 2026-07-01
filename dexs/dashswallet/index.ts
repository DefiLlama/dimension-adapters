import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SWAP_EXECUTED =
    "event SwapExecuted(address indexed user, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 destAmount, uint256 surplus, uint256 protocolFee, uint256 cashback, address router)";

const CONTRACTS: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
        "0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c",
        "0x024cceeca9852c3d486192f38d0c37a3296c6449",
        "0xf129abaa92feb1689f0b9d1f664d395c60d41512",
    ],
    [CHAIN.OPTIMISM]: [
        "0x79191c6647b05fd98f53c9db0861145739eac4e6",
        "0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c",
        "0xbbb89263e7fee2b6590663f72bcff18e401fd103",
    ],
    [CHAIN.BSC]: [
        "0x29e1fd1a1ceafaee68d0a14139d7e424eef44433",
        "0x7d5bd4646debeef13449af97e6f20d02496cef52",
        "0x43f597dfe2840ce39663c676c078b0fed86013b3",
    ],
    [CHAIN.POLYGON]: [
        "0x54f33b724ebf94673f843572f7b1d5edcb19615e",
        "0x4123125394b21aae3061e253b60bd79c58a25049",
        "0x283d20ee2c5263bc14b83dd9d8c21bae79d3dd2a",
    ],
    [CHAIN.BASE]: [
        "0xa7a7747172f39130f9a59dce68585771702f05fd",
        "0xddd43135a896cc864066ace33af03ba3bb6e8c51",
        "0x89f5fbeafb2bac8a1b47b901d67d178c4362e796",
    ],
    [CHAIN.ARBITRUM]: [
        "0x7c4313534824776303e623d9a804688481e01aa8",
        "0xaabb8ce890ae0e84b19cf9eac191b0b865cdfad3",
        "0x5091719f1300aefd20d5c7771861bfd5d0424c82",
    ],
    [CHAIN.AVAX]: [
        "0x577c6502d4a8596c559d8da0f32204244276d088",
        "0x05278a9d046c30dae9cc1eff2274ce77de77fa96",
        "0x0e6aa9230e59c24d2dec876fecb004582ee1aa8e",
    ],
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const logs = await options.getLogs({
        targets: CONTRACTS[options.chain],
        eventAbi: SWAP_EXECUTED,
        flatten: true,
    });

    for (const log of logs) {
        dailyVolume.add(log.srcToken, log.srcAmount);
    }

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: Object.keys(CONTRACTS),
    start: "2026-06-27",
    methodology: {
        Volume: "Sell-side value of each swap executed through DashsWallet Aave collateral/debt adapters across 7 chains, denominated in the source token.",
    },
};

export default adapter;
