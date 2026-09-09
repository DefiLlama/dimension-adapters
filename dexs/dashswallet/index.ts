import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getConfig, getCache } from "../../helpers/cache";
import { ChainApi } from "@defillama/sdk";
import * as sdk from "@defillama/sdk";

const SWAP_EXECUTED =
    "event SwapExecuted(address indexed user, address indexed srcToken, address indexed destToken, uint256 srcAmount, uint256 destAmount, uint256 surplus, uint256 protocolFee, uint256 cashback, address router)";

// DashsWallet SwapVersionRegistry — mesmo endereco (deploy determinístico CREATE2) nas 7 chains.
// Fonte da verdade on-chain dos swap adapters do protocolo; verificavel em qualquer explorer,
// ex.: https://etherscan.io/address/0xa20E2C5B59829a71D4bFA9dA5d166af5aE707Ce4
const SWAP_VERSION_REGISTRY = "0xa20E2C5B59829a71D4bFA9dA5d166af5aE707Ce4";

const REGISTRY_ABI = {
    getContractNames: "function getContractNames() view returns (string[])",
    getAllVersions: "function getAllVersions(string contractName) view returns (address[])",
};

// Config por chain:
//   - start:    quando o adapter passa a coletar dados na chain.
//   - legacy:   frotas pre-registry (Aave v1 original / v4 Base) que o getAllVersions NAO retorna;
//               mescladas ao resultado dinamico do registry (dedup por Set cobre overlap).
//   - fallback: snapshot estatico integral dos swap adapters do DashsWallet (v1..v10) por chain,
//               usado SOMENTE se a leitura on-chain do registry falhar e o cache S3 estiver vazio (N2),
//               para nunca zerar o dia do protocolo.
// A fonte da verdade em operacao normal e o registry on-chain — estas listas sao complemento
// legado + contingencia, nao a fonte primaria.
const chainConfig: Record<string, { start: string; legacy: string[]; fallback: string[] }> = {
    [CHAIN.ETHEREUM]: {
        start: "2026-06-27",
        legacy: [
            "0x0c6be4c1b1c368d2cd95caf9b4be3793711bc91c",
            "0x024cceeca9852c3d486192f38d0c37a3296c6449",
            "0xf129abaa92feb1689f0b9d1f664d395c60d41512",
        ],
        fallback: [
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
    },
    [CHAIN.OPTIMISM]: {
        start: "2026-06-27",
        legacy: [
            "0x79191c6647b05fd98f53c9db0861145739eac4e6",
            "0x7bcacf64276cb0b0f43d1caa2dd5d4a31526935c",
            "0xbbb89263e7fee2b6590663f72bcff18e401fd103",
            "0x772f6bbbd531cf6934fb1842ed3ed4ba3992afd6",
            "0x4330cd5202a97c8f46396df7225d4b43684bfa0e",
            "0x9af98545c4402e0114d644212112e97362b0d029",
        ],
        fallback: [
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
    },
    [CHAIN.BSC]: {
        start: "2026-06-27",
        legacy: [
            // Aave swap adapter v1 (frota original) — legado pre-registry
            "0x29e1fd1a1ceafaee68d0a14139d7e424eef44433",
            "0x7d5bd4646debeef13449af97e6f20d02496cef52",
            "0x43f597dfe2840ce39663c676c078b0fed86013b3",
        ],
        fallback: [
            // v1 Aave original fleet (3)
            "0x29e1fd1a1ceafaee68d0a14139d7e424eef44433",
            "0x7d5bd4646debeef13449af97e6f20d02496cef52",
            "0x43f597dfe2840ce39663c676c078b0fed86013b3",
            // CollateralSwap v8 / v10
            "0x106f51573d9c3b56105a9f9c7a45a37758aabaaf",
            "0x5681dc09bf0402a49ea755ad40d90286f9d2214c",
            // CompoundSwap v9
            "0xcf834ddf504406613cd934144cccbeece85685f2",
            // DebtSwap v8 / v10
            "0x8018071f5784dc92c042972aa5c1fb57abbb2e29",
            "0xf07e0c454642b2f14dc54519247378561727e071",
            // Repay v8 / v10
            "0x363aa4ee5bce709ec660627c508a9d9bf20c0a50",
            "0xfe031c91ac69e88093a8a34cc54cd89a190129df",
        ],
    },
    [CHAIN.POLYGON]: {
        start: "2026-06-27",
        legacy: [
            // Aave swap adapter v1 (frota original) — legado pre-registry
            "0x54f33b724ebf94673f843572f7b1d5edcb19615e",
            "0x4123125394b21aae3061e253b60bd79c58a25049",
            "0x283d20ee2c5263bc14b83dd9d8c21bae79d3dd2a",
        ],
        fallback: [
            // v1 Aave original fleet (3)
            "0x54f33b724ebf94673f843572f7b1d5edcb19615e",
            "0x4123125394b21aae3061e253b60bd79c58a25049",
            "0x283d20ee2c5263bc14b83dd9d8c21bae79d3dd2a",
            // CollateralSwap v8 / v10
            "0xb5b96007429c73ca5eb2109f1dd64c63e6efc856",
            "0xeb4a8b3196adebd69e36023b2d537224be2cb519",
            // DebtSwap v8 / v10
            "0xd54a77a13d4dbc8409769fd3133fa24258ceff49",
            "0x5eedd2c4d4a0ac91d9023b54fce228765609d506",
            // Repay v8 / v10
            "0x1b84191ad0885e6a6251daff71a9a7fa55e62a5a",
            "0x22cd30be2fa36b89ed8a9ba0cc3a6e9919ee3c13",
        ],
    },
    [CHAIN.BASE]: {
        start: "2026-06-27",
        legacy: [
            "0xa7a7747172f39130f9a59dce68585771702f05fd",
            "0xddd43135a896cc864066ace33af03ba3bb6e8c51",
            "0x89f5fbeafb2bac8a1b47b901d67d178c4362e796",
            "0x5b4086e2d9584380eb9c19bbf8d96fe9123dbaf8",
            "0x9f45ce1973ba1c6a3b331081908d7536316cc83f",
        ],
        fallback: [
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
    },
    [CHAIN.ARBITRUM]: {
        start: "2026-06-27",
        legacy: [
            "0x7c4313534824776303e623d9a804688481e01aa8",
            "0xaabb8ce890ae0e84b19cf9eac191b0b865cdfad3",
            "0x5091719f1300aefd20d5c7771861bfd5d0424c82",
        ],
        fallback: [
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
    },
    [CHAIN.AVAX]: {
        start: "2026-06-27",
        legacy: [
            "0x577c6502d4a8596c559d8da0f32204244276d088",
            "0x05278a9d046c30dae9cc1eff2274ce77de77fa96",
            "0x0e6aa9230e59c24d2dec876fecb004582ee1aa8e",
            "0x7810fed01457828f558f3f3999ec432847f4e2c3",
            "0xd7c6a37d45f399b1be7f0288e26bb2fe1475f05f",
            "0x1386c1b3b5eeda37240a57683a3754e8405d02f9",
        ],
        fallback: [
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
    },
};

const getContracts = async (options: FetchOptions): Promise<string[]> => {
    const dynamic = await getConfig(`dashswallet/${options.chain}`, undefined, {
        fetcher: async () => {
            const api = new ChainApi({ chain: options.chain });

            // 1. Nomes gerenciados lidos dinamicamente on-chain (sem hardcode)
            const names: string[] = await api.call({
                target: SWAP_VERSION_REGISTRY,
                abi: REGISTRY_ABI.getContractNames,
            });

            // 2. Historico de todas as versoes por adaptador
            const results = await api.multiCall({
                abi: REGISTRY_ABI.getAllVersions,
                calls: names.map((name: string) => ({ target: SWAP_VERSION_REGISTRY, params: [name] })),
                permitFailure: true,
            });

            const registered = results
                .flat()
                .filter((addr: any) => typeof addr === "string" && addr !== "0x0000000000000000000000000000000000000000")
                .map((addr: string) => addr.toLowerCase());

            const extras = (chainConfig[options.chain]?.legacy || []).map((a) => a.toLowerCase());
            const combined = [...new Set([...registered, ...extras])];

            // Observabilidade: compara com o ultimo snapshot PERSISTIDO no S3, nao com estado em
            // memoria. O fetcher do getConfig roda no maximo 1x por processo (a promise e memoizada),
            // entao comparar contra uma variavel de modulo nunca dispararia. Neste ponto o S3 ainda
            // guarda o snapshot do processo anterior (getConfig so o reescreve DEPOIS do fetcher
            // retornar), entao a chegada de uma nova versao fica de fato observavel no log.
            try {
                const prevSnapshot = await getCache("config-cache", `dashswallet/${options.chain}`);
                if (Array.isArray(prevSnapshot) && prevSnapshot.length > 0) {
                    const prevSet = new Set(prevSnapshot.map((a: string) => a.toLowerCase()));
                    const newAddrs = combined.filter((a) => !prevSet.has(a));
                    if (newAddrs.length > 0) {
                        sdk.log(`[dashswallet] Novo(s) contrato(s) detectado(s) em ${options.chain}: ${newAddrs.join(", ")}`);
                    }
                }
            } catch (e) {
                // Observabilidade nunca deve quebrar a resolucao de targets: loga o erro e segue,
                // sem re-lancar (re-lancar zeraria o dia por causa de uma leitura de log — proibido, N2).
                sdk.log(`[dashswallet] leitura do snapshot S3 p/ deteccao de versao falhou em ${options.chain}:`, e);
            }

            return combined;
        },
    });

    // Fallback de contingencia (N2): se a leitura on-chain falhar e o cache estiver vazio,
    // nunca retorna [] para nao zerar o dia do protocolo.
    if (!Array.isArray(dynamic) || dynamic.length === 0) {
        sdk.log(`[dashswallet] registry fetch falhou em ${options.chain}; usando fallback estatico`);
        return chainConfig[options.chain]?.fallback ?? [];
    }

    return dynamic;
};

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const targets = await getContracts(options);

    const logs = await options.getLogs({
        targets,
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
    chains: Object.entries(chainConfig).map(([chain, cfg]) => [chain, { start: cfg.start }] as [string, { start: string }]),
    methodology: {
        Volume: "Sell-side value of each swap executed through DashsWallet collateral, debt, repay, compound and morpho swap adapters across 7 chains, denominated in the source token.",
    },
};

export default adapter;
