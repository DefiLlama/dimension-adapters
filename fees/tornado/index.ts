import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const withdrawABI = "event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee)";
const stakeBurnedABI = "event StakeBurned(address relayer, uint256 amountBurned)";

// RelayerRegistry proxy on Ethereum
const RELAYER_REGISTRY = "0x58E8dCC13BE9780fC42E8723D8EaD4CF46943dF2";
// TORN token
const TORN = "0x77777FeddddFFc19Ff86DB637967013e6c6A116C";

const TORNADO_CONTRACTS = {
    [CHAIN.ETHEREUM]: {
        ETH: {
            pools: [
                "0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc", // 0.1 ETH
                "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936", // 1 ETH
                "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf", // 10 ETH
                "0xa160cdab225685da1d56aa342ad8841c3b53f291", // 100 ETH
            ],
            token: ADDRESSES.null // Native ETH
        },
        DAI: {
            pools: [
                "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3", // 100 DAI
                "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144", // 1,000 DAI
                "0x07687e702b410fa43f4cb4af7fa097918ffd2730", // 10,000 DAI
                "0x23773E65ed146A459791799d01336DB287f25334", // 100,000 DAI
            ],
            token: ADDRESSES.ethereum.DAI
        },
        cDAI: {
            pools: [
                "0x22aaA7720ddd5388A3c0A3333430953C68f1849b", // 5,000 cDAI
                "0x03893a7c7463AE47D46bc7f091665f1893656003", // 50,000 cDAI
                "0x2717c5e28cf931547B621a5dddb772Ab6A35B701", // 500,000 cDAI
                "0xD21be7248e0197Ee08E0c20D4a96DEBdaC3D20Af", // 5,000,000 cDAI
            ],
            token: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643"
        },
        USDC: {
            pools: [
                "0x4736dCf1b7A3d580672CcE6E7c65cd5cc9cFBa9D", // 100 USDC
                "0xd96f2B1c14Db8458374d9Aca76E26c3D18364307", // 1,000 USDC
            ],
            token: ADDRESSES.ethereum.USDC
        },
        USDT: {
            pools: [
                "0x169AD27A470D064DEDE56a2D3ff727986b15D52B", // 100 USDT
                "0x0836222F2B2B24A3F36f98668Ed8F0B38D1a872f", // 1,000 USDT
            ],
            token: ADDRESSES.ethereum.USDT
        },
        WBTC: {
            pools: [
                "0x178169B423a011fff22B9e3F3abeA13414dDD0F1", // 0.1 WBTC
                "0x610B717796ad172B316836AC95a2ffad065CeaB4", // 1 WBTC
                "0xbB93e510BbCD0B7beb5A853875f9eC60275CF498", // 10 WBTC
            ],
            token: ADDRESSES.ethereum.WBTC
        }
    },
    [CHAIN.ARBITRUM]: {
        ETH: {
            pools: [
                "0x84443CFd09A48AF6eF360C6976C5392aC5023a1F", // 0.1 ETH
                "0xd47438C816c9E7f2E2888E060936a499Af9582b3", // 1 ETH
                "0x330bdFADE01eE9bF63C209Ee33102DD334618e0a", // 10 ETH
                "0x1E34A77868E19A6647b1f2F47B51ed72dEDE95DD", // 100 ETH
            ],
            token: ADDRESSES.null // Native ETH
        }
    },
    [CHAIN.OPTIMISM]: {
        ETH: {
            pools: [
                "0x84443CFd09A48AF6eF360C6976C5392aC5023a1F", // 0.1 ETH
                "0xd47438C816c9E7f2E2888E060936a499Af9582b3", // 1 ETH
                "0x330bdFADE01eE9bF63C209Ee33102DD334618e0a", // 10 ETH
                "0x1E34A77868E19A6647b1f2F47B51ed72dEDE95DD", // 100 ETH
            ],
            token: ADDRESSES.null // Native ETH
        }
    },
    [CHAIN.BSC]: {
        BNB: {
            pools: [
                "0x84443CFd09A48AF6eF360C6976C5392aC5023a1F", // 0.1 BNB
                "0xd47438C816c9E7f2E2888E060936a499Af9582b3", // 1 BNB
                "0x330bdFADE01eE9bF63C209Ee33102DD334618e0a", // 10 BNB
                "0x1E34A77868E19A6647b1f2F47B51ed72dEDE95DD", // 100 BNB
            ],
            token: ADDRESSES.null // Native BNB
        }
    },
    [CHAIN.XDAI]: {
        XDAI: {
            pools: [
                "0x1E34A77868E19A6647b1f2F47B51ed72dEDE95DD", // 100 xDAI
                "0xdf231d99Ff8b6c6CBF4E9B9a945CBAcEF9339178", // 1,000 xDAI
                "0xaf4c0B70B2Ea9FB7487C7CbB37aDa259579fe040", // 10,000 xDAI
                "0xa5C2254e4253490C54cef0a4347fddb8f75A4998", // 100,000 xDAI
            ],
            token: ADDRESSES.null // Native xDAI
        }
    },
    [CHAIN.POLYGON]: {
        POLYGON: {
            pools: [
                "0x1E34A77868E19A6647b1f2F47B51ed72dEDE95DD", // 100 MATIC
                "0xdf231d99Ff8b6c6CBF4E9B9a945CBAcEF9339178", // 1,000 MATIC
                "0xaf4c0B70B2Ea9FB7487C7CbB37aDa259579fe040", // 10,000 MATIC
                "0xa5C2254e4253490C54cef0a4347fddb8f75A4998", // 100,000 MATIC
            ],
            token: ADDRESSES.null // Native MATIC
        }
    },
    [CHAIN.AVAX]: {
        AVAX: {
            pools: [
                "0x330bdFADE01eE9bF63C209Ee33102DD334618e0a", // 10 AVAX
                "0x1E34A77868E19A6647b1f2F47B51ed72dEDE95DD", // 100 AVAX
                "0xaf8d1839c3c67cf571aa74B5c12398d4901147B3", // 500 AVAX
            ],
            token: ADDRESSES.null // Native AVAX
        }
    }
};

interface TornadoPoolData {
    pools: string[];
    token: string;
}

const getFees = async ({ getLogs, chain, createBalances }: FetchOptions) => {
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    const dailySupplySideRevenue = createBalances();

    const contracts = TORNADO_CONTRACTS[chain];
    if (!contracts) {
        return { dailyFees, dailyRevenue, dailySupplySideRevenue };
    }

    // 1. Collect all withdrawal fees paid to relayers
    for (const [, data] of Object.entries(contracts) as [string, TornadoPoolData][]) {
        for (const pool of data.pools) {
            const logs = await getLogs({
                target: pool,
                eventAbi: withdrawABI,
            });

            for (const log of logs) {
                const fee = log.fee.toString();
                dailyFees.add(data.token, fee);
                // By default everything goes to relayers (Supply Side)
                dailySupplySideRevenue.add(data.token, fee);
            }
        }
    }

    // 2. On Ethereum only: read real protocol revenue from StakeBurned events (in TORN)
    //On Ethereum the protocol share is paid separately in TORN (not deducted from the ETH/token fee)
    if (chain === CHAIN.ETHEREUM) {
        const burnLogs = await getLogs({
            target: RELAYER_REGISTRY,
            eventAbi: stakeBurnedABI,
        });

        for (const log of burnLogs) {
            const amountBurned = Number(log.amountBurned);
            // This is the true protocol revenue distributed to TORN stakers
            dailyRevenue.add(TORN, amountBurned);
        }
    }

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "All fees paid by users to relayers on withdrawal (from Withdrawal events).",
    Revenue: "Protocol revenue on Ethereum only. Collected by burning TORN from registered relayers' stakes (StakeBurned events on RelayerRegistry). This TORN is distributed to governance stakers. Small pools (0.1 ETH, 100 DAI, 100/1k USDC, 100/1k USDT) and all non-Ethereum chains have no protocol fee.",
    SupplySideRevenue: "Fees paid to relayers. On Ethereum the protocol share is paid separately in TORN (not deducted from the ETH/token fee).",
};

const adapter: SimpleAdapter = {
    methodology,
    fetch: getFees,
    version: 2,
    chains: [
        CHAIN.ETHEREUM,
        CHAIN.BSC,
        CHAIN.AVAX,
        CHAIN.OPTIMISM,
        CHAIN.ARBITRUM,
        CHAIN.POLYGON,
        CHAIN.XDAI,
    ],
    adapter: {},
    isExpensiveAdapter: true,
    pullHourly: true,
};

export default adapter;
