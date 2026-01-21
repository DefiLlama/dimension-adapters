import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// cbEGGS (base)
const cbEggsContract = "0xdDbAbe113c376f51E5817242871879353098c296";
const sendEthAbi = "event SendEth(address to, uint256 amount)";
const feeAddressAbi = "function FEE_ADDRESS() view returns (address)";

// Auto Compound vaults (optimism)
const feeChargedAbi = "event ChargedFees(uint256 callFees, uint256 infiniteFees, uint256 burnedFees)";
const nativeAbi = "address:native"
const autoCompounderVaults = [
    "0x569D92f0c94C04C74c2f3237983281875D9e2247", // ITP/VELO
    "0xFCEa66a3333a4A3d911ce86cEf8Bdbb8bC16aCA6", // ITP/DHT
    "0x2811a577cf57A2Aa34e94B0Eb56157066717563f", // ITP/wstETH
    "0x8A2e22BdA1fF16bdEf27b6072e087452fa874b69", // ITP/OP
    "0x3092F8dE262F363398F15DDE5E609a752938Cc11", // ITP/WBTC
    "0xC4628802a42F83E5bce3caB05A4ac2F6E485F276", // ITP/USDC
];

// cbEGGS fees (base)
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const feeAddress = await options.api.call({
        target: cbEggsContract,
        abi: feeAddressAbi,
    });

    const sendEthLogs = await options.getLogs({
        target: cbEggsContract,
        eventAbi: sendEthAbi,
        onlyArgs: true,
    });

    sendEthLogs.forEach(log => {
        const toAddress = log.to.toLowerCase();
        const amount = Number(log.amount);

        if (toAddress === feeAddress.toLowerCase()) {
            // 10% ETH burned 
            dailyFees.addGasToken(amount * 10 / 9);
            dailyRevenue.addGasToken(amount);
        }
    });

    return {
        dailyFees,
        dailyRevenue,
    };
};

// Auto compounder vault fees (optimism)
const fetchOptimism = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    for (const vault of autoCompounderVaults) {
        const nativeToken = await options.api.call({
            target: vault,
            abi: nativeAbi,
        });

        const feeChargedLogs = await options.getLogs({
            target: vault,
            eventAbi: feeChargedAbi,
            onlyArgs: true,
        });

        feeChargedLogs.forEach(log => {
            const totalFees = Number(log.callFees) + Number(log.infiniteFees) + Number(log.burnedFees);
            dailyFees.add(nativeToken, totalFees);
            dailyRevenue.add(nativeToken, Number(log.infiniteFees));
        });
    }

    return {
        dailyFees,
        dailyRevenue
    };
};

const methodology = {
    Fees: "Total fees collected from auto compounder vaults and user deposits/withdrawals on the cbEGGS contract.",
    Revenue: "Portion of auto compounder fees and 90% of cbEGGS fees are sent to the infinite fee address as revenue.",
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: "2025-02-22",
        },
        [CHAIN.OPTIMISM]: {
            fetch: fetchOptimism,
            start: "2025-11-06",
        },
    },
    methodology,
};

export default adapter;