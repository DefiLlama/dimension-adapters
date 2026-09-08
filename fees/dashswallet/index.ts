import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig } from "../../helpers/cache";
import { ChainApi } from "@defillama/sdk";
import * as sdk from "@defillama/sdk";

const SWAP_EXECUTED =
    "event SwapExecuted(address indexed user, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 destAmount, uint256 surplus, uint256 protocolFee, uint256 cashback, address router)";

const SWAP_VERSION_REGISTRY = "0xa20E2C5B59829a71D4bFA9dA5d166af5aE707Ce4";

const REGISTRY_ABI = {
    getContractNames: "function getContractNames() view returns (string[])",
    getAllVersions: "function getAllVersions(string contractName) view returns (address[])",
};

// Frotas históricas que antecedem o SwapVersionRegistry (v1 Aave original, v4 Base, v1 individuais)
// Confirmado via probe M.1 on-chain contra as 7 redes. O dedup Set cobre qualquer overlap.
const EXTRA_CONTRACTS: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
        "0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c",
        "0x024cceeca9852c3d486192f38d0c37a3296c6449",
        "0xf129abaa92feb1689f0b9d1f664d395c60d41512",
    ],
    [CHAIN.OPTIMISM]: [
        "0x79191c6647b05fd98f53c9db0861145739eac4e6",
        "0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c",
        "0xbbb89263e7fee2b6590663f72bcff18e401fd103",
        "0x772f6bbbd531cf6934fb1842ed3ed4ba3992afd6",
        "0x4330cd5202a97c8f46396df7225d4b43684bfa0e",
        "0x9af98545c4402e0114d644212112e97362b0d029",
    ],
    [CHAIN.BSC]: [
        "0x29e1fd1a1ceafaee68d0a14139d7e424eef44433",
        "0x72a5baea0f512705199ff9d63ad9226cfd5bfdb1",
        "0x7d6a422ea7be7e39efaaae8916ce9d1e57c6b8bf",
        "0x2cfb37b51b0f5923984bf402170327f2cbb4d97d",
        "0x4a9d701a520a7b48956bb2013f9c6d4838612140",
        "0x098ce1a64f3316982ec4584bbfe2fbcbfb184e9d",
    ],
    [CHAIN.POLYGON]: [
        "0xd1beafb7ba408fa2321453b34208a0df7fc2ee2f",
        "0xefb09c2a6476bbff76e6a18d18408f90c3757434",
        "0x904a085ec669d0cf3f413a968bb03b10bce9052b",
        "0x351d1a6039535eb07e446555dd5dff7e0996f014",
        "0xd9f6a735c023d8c1170d10b70ad00a6e0df311dc",
    ],
    [CHAIN.BASE]: [
        "0xa7a7747172f39130f9a59dce68585771702f05fd",
        "0xddd43135a896cc864066ace33af03ba3bb6e8c51",
        "0x89f5fbeafb2bac8a1b47b901d67d178c4362e796",
        "0x5b4086e2d9584380eb9c19bbf8d96fe9123dbaf8",
        "0x9f45ce1973ba1c6a3b331081908d7536316cc83f",
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
        "0x7810fed01457828f558f3f3999ec432847f4e2c3",
        "0xd7c6a37d45f399b1be7f0288e26bb2fe1475f05f",
        "0x1386c1b3b5eeda37240a57683a3754e8405d02f9",
    ],
};

// Snapshot de CONTINGÊNCIA (v1..v10) usado estritamente se o RPC falhar e o cache estiver vazio (N2).
const FALLBACK_CONTRACTS: Record<string, string[]> = {
    [CHAIN.ETHEREUM]: [
        "0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c",
        "0x024cceeca9852c3d486192f38d0c37a3296c6449",
        "0xf129abaa92feb1689f0b9d1f664d395c60d41512",
        "0x1705577a897c6488e06ee520d8e041bde19716d2",
        "0x877dd1554a01ec2654da34a336f07119de99b5bb",
        "0x6cdadb2eaee0786ab012f906e15f37ea521fd922",
        "0xf34653897129205673ccdb15502461d74acbbb25",
        "0x43cae80730d46e097238bdb866b5046cc16624d0",
        "0x5746431ccfa5b4a1495bcbf3e288b03ca0fb00ff",
        "0xb4373d512f1709f5741d9d5bb61f255bef6100f7",
        "0x949987788c5d936f248bf875bc9eb106fad8e131",
    ],
    [CHAIN.OPTIMISM]: [
        "0x79191c6647b05fd98f53c9db0861145739eac4e6",
        "0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c",
        "0xbbb89263e7fee2b6590663f72bcff18e401fd103",
        "0xf776c0908802af15f95f573e154713bbf171c95f",
        "0x20c770d142ecbbddd532c776a90333584eabf1aa",
        "0x218afab5d288e1f480f92d342bd29071e28e898e",
        "0x6db2bf5a8f1797fef6af648df49f0ec38db5d4e2",
        "0xada64e7644d73f974195d33ec3776f2f44f3f052",
        "0x37d909afaac47fe4ada424be1c50fef9f9b85474",
        "0x772f6bbbd531cf6934fb1842ed3ed4ba3992afd6",
        "0x4330cd5202a97c8f46396df7225d4b43684bfa0e",
        "0x9af98545c4402e0114d644212112e97362b0d029",
    ],
    [CHAIN.BSC]: [
        "0x29e1fd1a1ceafaee68d0a14139d7e424eef44433",
        "0x72a5baea0f512705199ff9d63ad9226cfd5bfdb1",
        "0x7d6a422ea7be7e39efaaae8916ce9d1e57c6b8bf",
        "0x2cfb37b51b0f5923984bf402170327f2cbb4d97d",
        "0x5681dc09bf0402a49ea755ad40d90286f9d2214c",
        "0xcf834ddf504406613cd934144cccbeece85685f2",
        "0x4a9d701a520a7b48956bb2013f9c6d4838612140",
        "0xf07e0c454642b2f14dc54519247378561727e071",
        "0x098ce1a64f3316982ec4584bbfe2fbcbfb184e9d",
        "0xfe031c91ac69e88093a8a34cc54cd89a190129df",
    ],
    [CHAIN.POLYGON]: [
        "0xd1beafb7ba408fa2321453b34208a0df7fc2ee2f",
        "0xefb09c2a6476bbff76e6a18d18408f90c3757434",
        "0x904a085ec669d0cf3f413a968bb03b10bce9052b",
        "0x351d1a6039535eb07e446555dd5dff7e0996f014",
        "0xeb4a8b3196adebd69e36023b2d537224be2cb519",
        "0xd9f6a735c023d8c1170d10b70ad00a6e0df311dc",
        "0x5eedd2c4d4a0ac91d9023b54fce228765609d506",
        "0x1b84191ad0885e6a6251daff71a9a7fa55e62a5a",
        "0x22cd30be2fa36b89ed8a9ba0cc3a6e9919ee3c13",
    ],
    [CHAIN.BASE]: [
        "0xa7a7747172f39130f9a59dce68585771702f05fd",
        "0xddd43135a896cc864066ace33af03ba3bb6e8c51",
        "0x89f5fbeafb2bac8a1b47b901d67d178c4362e796",
        "0xa5632563fa98b1fd6da44433d3d374dd2bb56c21",
        "0xc589913ec0b272523556a6894177952411cfdd22",
        "0xa0a1208868a594a6629066306942df1723d72245",
        "0x02f1754fc3b2223cbb50175c8058616364188b4a",
        "0xdc4b424946a09885d2b0e315ded8145c4fda1a7b",
        "0x5746431ccfa5b4a1495bcbf3e288b03ca0fb00ff",
        "0x16847ecacc92805105c9bd61aa69afc3a9fbe47c",
        "0xcc8e30c5a036460017481af84e69bed5eaacff01",
        "0x5b4086e2d9584380eb9c19bbf8d96fe9123dbaf8",
        "0x9f45ce1973ba1c6a3b331081908d7536316cc83f",
    ],
    [CHAIN.ARBITRUM]: [
        "0x7c4313534824776303e623d9a804688481e01aa8",
        "0xaabb8ce890ae0e84b19cf9eac191b0b865cdfad3",
        "0x5091719f1300aefd20d5c7771861bfd5d0424c82",
        "0xbb6c59caeb117141fa1b8c68c4ab949f0a40a077",
        "0xdabaec67c0d3761ac814887334b060a0981edd7a",
        "0xb0dd43facda03cae949862431d78df92620bcdd6",
        "0x27d5c88c1d9ccab2f856878f6dfe2b2f6aec5099",
        "0x69c64778f5866feae0a5e17ed588ecb82774f75b",
        "0xc28363eecc15f1865b81c2c19626d63767a36d4e",
        "0x86788e23ca6ae235274d9f74dd4174824bd665da",
    ],
    [CHAIN.AVAX]: [
        "0x577c6502d4a8596c559d8da0f32204244276d088",
        "0x05278a9d046c30dae9cc1eff2274ce77de77fa96",
        "0x0e6aa9230e59c24d2dec876fecb004582ee1aa8e",
        "0x9df4653b0e810fb3791497081120dae4fc73064c",
        "0xc60a7a9e260ccdabd014887ff40404f50bda656b",
        "0xfe610e79a7dae38ab0dc26fbd4b559784e8c3c84",
        "0x0e31df4696c2bc4f21890796c81dde2f294e91dd",
        "0x6fbb7bede16f52d17cc3829e8b94c989a9de9730",
        "0x0204201ffa3a9b03c7668655b8f68fa0d9e16360",
        "0x7810fed01457828f558f3f3999ec432847f4e2c3",
        "0xd7c6a37d45f399b1be7f0288e26bb2fe1475f05f",
        "0x1386c1b3b5eeda37240a57683a3754e8405d02f9",
    ],
};

const lastResolvedByChain: Record<string, string[]> = {};

const getContracts = async (options: FetchOptions): Promise<string[]> => {
    const dynamic = await getConfig(`dashswallet/${options.chain}`, undefined, {
        fetcher: async () => {
            const api = new ChainApi({ chain: options.chain });

            // 1. Nomes gerenciados lidos dinamicamente on-chain (N6)
            const names: string[] = await api.call({
                target: SWAP_VERSION_REGISTRY,
                abi: REGISTRY_ABI.getContractNames,
            });

            // 2. Histórico de todas as versões por adaptador
            const results = await api.multiCall({
                abi: REGISTRY_ABI.getAllVersions,
                calls: names.map((name: string) => ({ target: SWAP_VERSION_REGISTRY, params: [name] })),
                permitFailure: true,
            });

            const registered = results
                .flat()
                .filter((addr: any) => typeof addr === "string" && addr !== "0x0000000000000000000000000000000000000000")
                .map((addr: string) => addr.toLowerCase());

            const extras = (EXTRA_CONTRACTS[options.chain] || []).map((a) => a.toLowerCase());
            const combined = [...new Set([...registered, ...extras])];

            // Observabilidade (A.4): detecta nova versão (ex: V11) adicionada on-chain
            const prev = lastResolvedByChain[options.chain];
            if (prev && prev.length > 0) {
                const prevSet = new Set(prev);
                const newAddrs = combined.filter((a) => !prevSet.has(a));
                if (newAddrs.length > 0) {
                    sdk.log(`[dashswallet] Novo(s) contrato(s) detectado(s) em ${options.chain}: ${newAddrs.join(", ")}`);
                }
            }
            lastResolvedByChain[options.chain] = combined;

            return combined;
        },
    });

    // Fallback de contingência (N2): se a leitura on-chain falhar e o cache estiver vazio,
    // nunca retorna [] para não zerar o dia do protocolo.
    if (!Array.isArray(dynamic) || dynamic.length === 0) {
        sdk.log(`[dashswallet] registry fetch falhou em ${options.chain}; usando FALLBACK_CONTRACTS`);
        return FALLBACK_CONTRACTS[options.chain] ?? [];
    }

    return dynamic;
};

const breakdownMethodology = {
    Fees: {
        "Swap Surplus": "Difference between actual swap output and the user's minimum accepted amount across DashsWallet swaps.",
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

    const targets = await getContracts(options);

    const logs = await options.getLogs({
        targets,
        eventAbi: SWAP_EXECUTED,
        flatten: true,
    });

    for (const log of logs) {
        dailyFees.add(log.destToken, log.surplus, "Swap Surplus");
        dailyRevenue.add(log.destToken, log.protocolFee, "Swap Surplus To Treasury");
        dailySupplySideRevenue.add(log.destToken, log.cashback, "Swap Surplus Cashback To User");
    }

    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: Object.keys(FALLBACK_CONTRACTS),
    start: "2026-06-27",
    methodology: {
        Fees: "Total surplus captured on DashsWallet swaps — difference between actual swap output and the user's minimum accepted amount.",
        Revenue: "Portion of surplus retained by the DashsWallet treasury after deducting cashback.",
        SupplySideRevenue: "Portion of surplus returned to the swap-initiating user as cashback.",
    },
    breakdownMethodology,
};

export default adapter;
