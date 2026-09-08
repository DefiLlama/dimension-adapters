import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SWAP_EXECUTED =
    "event SwapExecuted(address indexed user, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 destAmount, uint256 surplus, uint256 protocolFee, uint256 cashback, address router)";

const CONTRACTS: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
        // https://etherscan.io/address/0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c (Aave swap adapter v1 (original fleet))
        "0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c",
        // https://etherscan.io/address/0x024cceeca9852c3d486192f38d0c37a3296c6449 (Aave swap adapter v1 (original fleet))
        "0x024cceeca9852c3d486192f38d0c37a3296c6449",
        // https://etherscan.io/address/0xf129abaa92feb1689f0b9d1f664d395c60d41512 (Aave swap adapter v1 (original fleet))
        "0xf129abaa92feb1689f0b9d1f664d395c60d41512",
        // https://etherscan.io/address/0x1705577a897c6488e06ee520d8e041bde19716d2 (CollateralSwap v8)
        "0x1705577a897c6488e06ee520d8e041bde19716d2",
        // https://etherscan.io/address/0x877dd1554a01ec2654da34a336f07119de99b5bb (CollateralSwap v10)
        "0x877dd1554a01ec2654da34a336f07119de99b5bb",
        // https://etherscan.io/address/0x6cdadb2eaee0786ab012f906e15f37ea521fd922 (CompoundSwap v9)
        "0x6cdadb2eaee0786ab012f906e15f37ea521fd922",
        // https://etherscan.io/address/0xf34653897129205673ccdb15502461d74acbbb25 (DebtSwap v8)
        "0xf34653897129205673ccdb15502461d74acbbb25",
        // https://etherscan.io/address/0x43cae80730d46e097238bdb866b5046cc16624d0 (DebtSwap v10)
        "0x43cae80730d46e097238bdb866b5046cc16624d0",
        // https://etherscan.io/address/0x5746431ccfa5b4a1495bcbf3e288b03ca0fb00ff (MorphoSwap v9)
        "0x5746431ccfa5b4a1495bcbf3e288b03ca0fb00ff",
        // https://etherscan.io/address/0xb4373d512f1709f5741d9d5bb61f255bef6100f7 (Repay v8)
        "0xb4373d512f1709f5741d9d5bb61f255bef6100f7",
        // https://etherscan.io/address/0x949987788c5d936f248bf875bc9eb106fad8e131 (Repay v10)
        "0x949987788c5d936f248bf875bc9eb106fad8e131",
    ],
    [CHAIN.OPTIMISM]: [
        // https://optimistic.etherscan.io/address/0x79191c6647b05fd98f53c9db0861145739eac4e6 (Aave swap adapter v1 (original fleet))
        "0x79191c6647b05fd98f53c9db0861145739eac4e6",
        // https://optimistic.etherscan.io/address/0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c (Aave swap adapter v1 (original fleet))
        "0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c",
        // https://optimistic.etherscan.io/address/0xbbb89263e7fee2b6590663f72bcff18e401fd103 (Aave swap adapter v1 (original fleet))
        "0xbbb89263e7fee2b6590663f72bcff18e401fd103",
        // https://optimistic.etherscan.io/address/0xf776c0908802af15f95f573e154713bbf171c95f (CollateralSwap v8)
        "0xf776c0908802af15f95f573e154713bbf171c95f",
        // https://optimistic.etherscan.io/address/0x20c770d142ecbbddd532c776a90333584eabf1aa (CollateralSwap v10)
        "0x20c770d142ecbbddd532c776a90333584eabf1aa",
        // https://optimistic.etherscan.io/address/0x218afab5d288e1f480f92d342bd29071e28e898e (DebtSwap v8)
        "0x218afab5d288e1f480f92d342bd29071e28e898e",
        // https://optimistic.etherscan.io/address/0x6db2bf5a8f1797fef6af648df49f0ec38db5d4e2 (DebtSwap v10)
        "0x6db2bf5a8f1797fef6af648df49f0ec38db5d4e2",
        // https://optimistic.etherscan.io/address/0xada64e7644d73f974195d33ec3776f2f44f3f052 (Repay v8)
        "0xada64e7644d73f974195d33ec3776f2f44f3f052",
        // https://optimistic.etherscan.io/address/0x37d909afaac47fe4ada424be1c50fef9f9b85474 (Repay v10)
        "0x37d909afaac47fe4ada424be1c50fef9f9b85474",
        // https://optimistic.etherscan.io/address/0x772f6bbbd531cf6934fb1842ed3ed4ba3992afd6 (CollateralSwap v1)
        "0x772f6bbbd531cf6934fb1842ed3ed4ba3992afd6",
        // https://optimistic.etherscan.io/address/0x4330cd5202a97c8f46396df7225d4b43684bfa0e (DebtSwap v1)
        "0x4330cd5202a97c8f46396df7225d4b43684bfa0e",
        // https://optimistic.etherscan.io/address/0x9af98545c4402e0114d644212112e97362b0d029 (Repay v1)
        "0x9af98545c4402e0114d644212112e97362b0d029",
    ],
    [CHAIN.BSC]: [
        // https://bscscan.com/address/0x29e1fd1a1ceafaee68d0a14139d7e424eef44433 (Aave swap adapter v1 (original fleet))
        "0x29e1fd1a1ceafaee68d0a14139d7e424eef44433",
        // https://bscscan.com/address/0x7d5bd4646debeef13449af97e6f20d02496cef52 (Aave swap adapter v1 (original fleet))
        "0x7d5bd4646debeef13449af97e6f20d02496cef52",
        // https://bscscan.com/address/0x43f597dfe2840ce39663c676c078b0fed86013b3 (Aave swap adapter v1 (original fleet))
        "0x43f597dfe2840ce39663c676c078b0fed86013b3",
        // https://bscscan.com/address/0x106f51573d9c3b56105a9f9c7a45a37758aabaaf (CollateralSwap v8)
        "0x106f51573d9c3b56105a9f9c7a45a37758aabaaf",
        // https://bscscan.com/address/0x5681dc09bf0402a49ea755ad40d90286f9d2214c (CollateralSwap v10)
        "0x5681dc09bf0402a49ea755ad40d90286f9d2214c",
        // https://bscscan.com/address/0xcf834ddf504406613cd934144cccbeece85685f2 (CompoundSwap v9)
        "0xcf834ddf504406613cd934144cccbeece85685f2",
        // https://bscscan.com/address/0x8018071f5784dc92c042972aa5c1fb57abbb2e29 (DebtSwap v8)
        "0x8018071f5784dc92c042972aa5c1fb57abbb2e29",
        // https://bscscan.com/address/0xf07e0c454642b2f14dc54519247378561727e071 (DebtSwap v10)
        "0xf07e0c454642b2f14dc54519247378561727e071",
        // https://bscscan.com/address/0x363aa4ee5bce709ec660627c508a9d9bf20c0a50 (Repay v8)
        "0x363aa4ee5bce709ec660627c508a9d9bf20c0a50",
        // https://bscscan.com/address/0xfe031c91ac69e88093a8a34cc54cd89a190129df (Repay v10)
        "0xfe031c91ac69e88093a8a34cc54cd89a190129df",
    ],
    [CHAIN.POLYGON]: [
        // https://polygonscan.com/address/0x54f33b724ebf94673f843572f7b1d5edcb19615e (Aave swap adapter v1 (original fleet))
        "0x54f33b724ebf94673f843572f7b1d5edcb19615e",
        // https://polygonscan.com/address/0x4123125394b21aae3061e253b60bd79c58a25049 (Aave swap adapter v1 (original fleet))
        "0x4123125394b21aae3061e253b60bd79c58a25049",
        // https://polygonscan.com/address/0x283d20ee2c5263bc14b83dd9d8c21bae79d3dd2a (Aave swap adapter v1 (original fleet))
        "0x283d20ee2c5263bc14b83dd9d8c21bae79d3dd2a",
        // https://polygonscan.com/address/0xb5b96007429c73ca5eb2109f1dd64c63e6efc856 (CollateralSwap v8)
        "0xb5b96007429c73ca5eb2109f1dd64c63e6efc856",
        // https://polygonscan.com/address/0xeb4a8b3196adebd69e36023b2d537224be2cb519 (CollateralSwap v10)
        "0xeb4a8b3196adebd69e36023b2d537224be2cb519",
        // https://polygonscan.com/address/0xd54a77a13d4dbc8409769fd3133fa24258ceff49 (DebtSwap v8)
        "0xd54a77a13d4dbc8409769fd3133fa24258ceff49",
        // https://polygonscan.com/address/0x5eedd2c4d4a0ac91d9023b54fce228765609d506 (DebtSwap v10)
        "0x5eedd2c4d4a0ac91d9023b54fce228765609d506",
        // https://polygonscan.com/address/0x1b84191ad0885e6a6251daff71a9a7fa55e62a5a (Repay v8)
        "0x1b84191ad0885e6a6251daff71a9a7fa55e62a5a",
        // https://polygonscan.com/address/0x22cd30be2fa36b89ed8a9ba0cc3a6e9919ee3c13 (Repay v10)
        "0x22cd30be2fa36b89ed8a9ba0cc3a6e9919ee3c13",
    ],
    [CHAIN.BASE]: [
        // https://basescan.org/address/0xa7a7747172f39130f9a59dce68585771702f05fd (Aave swap adapter v1 (original fleet))
        "0xa7a7747172f39130f9a59dce68585771702f05fd",
        // https://basescan.org/address/0xddd43135a896cc864066ace33af03ba3bb6e8c51 (Aave swap adapter v1 (original fleet))
        "0xddd43135a896cc864066ace33af03ba3bb6e8c51",
        // https://basescan.org/address/0x89f5fbeafb2bac8a1b47b901d67d178c4362e796 (Aave swap adapter v1 (original fleet))
        "0x89f5fbeafb2bac8a1b47b901d67d178c4362e796",
        // https://basescan.org/address/0xa5632563fa98b1fd6da44433d3d374dd2bb56c21 (CollateralSwap v8)
        "0xa5632563fa98b1fd6da44433d3d374dd2bb56c21",
        // https://basescan.org/address/0xc589913ec0b272523556a6894177952411cfdd22 (CollateralSwap v10)
        "0xc589913ec0b272523556a6894177952411cfdd22",
        // https://basescan.org/address/0xa0a1208868a594a6629066306942df1723d72245 (CompoundSwap v9)
        "0xa0a1208868a594a6629066306942df1723d72245",
        // https://basescan.org/address/0x02f1754fc3b2223cbb50175c8058616364188b4a (DebtSwap v8)
        "0x02f1754fc3b2223cbb50175c8058616364188b4a",
        // https://basescan.org/address/0xdc4b424946a09885d2b0e315ded8145c4fda1a7b (DebtSwap v10)
        "0xdc4b424946a09885d2b0e315ded8145c4fda1a7b",
        // https://basescan.org/address/0x5746431ccfa5b4a1495bcbf3e288b03ca0fb00ff (MorphoSwap v9)
        "0x5746431ccfa5b4a1495bcbf3e288b03ca0fb00ff",
        // https://basescan.org/address/0x16847ecacc92805105c9bd61aa69afc3a9fbe47c (Repay v8)
        "0x16847ecacc92805105c9bd61aa69afc3a9fbe47c",
        // https://basescan.org/address/0xcc8e30c5a036460017481af84e69bed5eaacff01 (Repay v10)
        "0xcc8e30c5a036460017481af84e69bed5eaacff01",
        // https://basescan.org/address/0x5b4086e2d9584380eb9c19bbf8d96fe9123dbaf8 (CollateralSwap v4)
        "0x5b4086e2d9584380eb9c19bbf8d96fe9123dbaf8",
        // https://basescan.org/address/0x9f45ce1973ba1c6a3b331081908d7536316cc83f (Repay v4)
        "0x9f45ce1973ba1c6a3b331081908d7536316cc83f",
    ],
    [CHAIN.ARBITRUM]: [
        // https://arbiscan.io/address/0x7c4313534824776303e623d9a804688481e01aa8 (Aave swap adapter v1 (original fleet))
        "0x7c4313534824776303e623d9a804688481e01aa8",
        // https://arbiscan.io/address/0xaabb8ce890ae0e84b19cf9eac191b0b865cdfad3 (Aave swap adapter v1 (original fleet))
        "0xaabb8ce890ae0e84b19cf9eac191b0b865cdfad3",
        // https://arbiscan.io/address/0x5091719f1300aefd20d5c7771861bfd5d0424c82 (Aave swap adapter v1 (original fleet))
        "0x5091719f1300aefd20d5c7771861bfd5d0424c82",
        // https://arbiscan.io/address/0xbb6c59caeb117141fa1b8c68c4ab949f0a40a077 (CollateralSwap v8)
        "0xbb6c59caeb117141fa1b8c68c4ab949f0a40a077",
        // https://arbiscan.io/address/0xdabaec67c0d3761ac814887334b060a0981edd7a (CollateralSwap v10)
        "0xdabaec67c0d3761ac814887334b060a0981edd7a",
        // https://arbiscan.io/address/0xb0dd43facda03cae949862431d78df92620bcdd6 (CompoundSwap v9)
        "0xb0dd43facda03cae949862431d78df92620bcdd6",
        // https://arbiscan.io/address/0x27d5c88c1d9ccab2f856878f6dfe2b2f6aec5099 (DebtSwap v8)
        "0x27d5c88c1d9ccab2f856878f6dfe2b2f6aec5099",
        // https://arbiscan.io/address/0x69c64778f5866feae0a5e17ed588ecb82774f75b (DebtSwap v10)
        "0x69c64778f5866feae0a5e17ed588ecb82774f75b",
        // https://arbiscan.io/address/0xc28363eecc15f1865b81c2c19626d63767a36d4e (Repay v8)
        "0xc28363eecc15f1865b81c2c19626d63767a36d4e",
        // https://arbiscan.io/address/0x86788e23ca6ae235274d9f74dd4174824bd665da (Repay v10)
        "0x86788e23ca6ae235274d9f74dd4174824bd665da",
    ],
    [CHAIN.AVAX]: [
        // https://snowtrace.io/address/0x577c6502d4a8596c559d8da0f32204244276d088 (Aave swap adapter v1 (original fleet))
        "0x577c6502d4a8596c559d8da0f32204244276d088",
        // https://snowtrace.io/address/0x05278a9d046c30dae9cc1eff2274ce77de77fa96 (Aave swap adapter v1 (original fleet))
        "0x05278a9d046c30dae9cc1eff2274ce77de77fa96",
        // https://snowtrace.io/address/0x0e6aa9230e59c24d2dec876fecb004582ee1aa8e (Aave swap adapter v1 (original fleet))
        "0x0e6aa9230e59c24d2dec876fecb004582ee1aa8e",
        // https://snowtrace.io/address/0x9df4653b0e810fb3791497081120dae4fc73064c (CollateralSwap v8)
        "0x9df4653b0e810fb3791497081120dae4fc73064c",
        // https://snowtrace.io/address/0xc60a7a9e260ccdabd014887ff40404f50bda656b (CollateralSwap v10)
        "0xc60a7a9e260ccdabd014887ff40404f50bda656b",
        // https://snowtrace.io/address/0xfe610e79a7dae38ab0dc26fbd4b559784e8c3c84 (DebtSwap v8)
        "0xfe610e79a7dae38ab0dc26fbd4b559784e8c3c84",
        // https://snowtrace.io/address/0x0e31df4696c2bc4f21890796c81dde2f294e91dd (DebtSwap v10)
        "0x0e31df4696c2bc4f21890796c81dde2f294e91dd",
        // https://snowtrace.io/address/0x6fbb7bede16f52d17cc3829e8b94c989a9de9730 (Repay v8)
        "0x6fbb7bede16f52d17cc3829e8b94c989a9de9730",
        // https://snowtrace.io/address/0x0204201ffa3a9b03c7668655b8f68fa0d9e16360 (Repay v10)
        "0x0204201ffa3a9b03c7668655b8f68fa0d9e16360",
        // https://snowtrace.io/address/0x7810fed01457828f558f3f3999ec432847f4e2c3 (CollateralSwap v1)
        "0x7810fed01457828f558f3f3999ec432847f4e2c3",
        // https://snowtrace.io/address/0xd7c6a37d45f399b1be7f0288e26bb2fe1475f05f (DebtSwap v1)
        "0xd7c6a37d45f399b1be7f0288e26bb2fe1475f05f",
        // https://snowtrace.io/address/0x1386c1b3b5eeda37240a57683a3754e8405d02f9 (Repay v1)
        "0x1386c1b3b5eeda37240a57683a3754e8405d02f9",
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
        Volume: "Sell-side value of each swap executed through DashsWallet collateral, debt, repay, compound and morpho swap adapters across 7 chains, denominated in the source token.",
    },
};

export default adapter;
