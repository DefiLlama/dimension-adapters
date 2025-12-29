import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";

const Config = {
    Platform: "0x4Aca671A420eEB58ecafE83700686a2AD06b20D8",
    VaultManager: "0x589a504f2ee9d054b483c700fa814863d639381e",
    Factory: "0xc184a3ecca684f2621c903a7943d85fa42f56671",
    startBlock: 1496459
}

const fetch: any = async (options: FetchOptions) => {
    const vaults = await getVaults(options);
    const fees = await getFeeEvents(vaults, options);

    return { dailyFees: fees };
}

async function getVaults({ getLogs }: FetchOptions): Promise<string[]> {
    const logChunk = await getLogs({
        target: Config.Factory,
        fromBlock: Config.startBlock,
        cacheInCloud: true,
        eventAbi: "event VaultAndStrategy(address indexed deployer, string vaultType, string strategyId, address vault, address strategy, string name, string symbol, address[] assets, bytes32 deploymentKey, uint256 vaultManagerTokenId)",
    });

    return logChunk.map(log => log[3]);
}

async function getFeeEvents(vaults: string[], options: FetchOptions): Promise<Balances> {
    const fees = {
        vaultManagerFee: 0,
        strategyLogicFee: 0,
        ecosystemFee: 0,
        multisigFee: 0,
    }
    const dailyFees = options.createBalances();
    const DECIMALS = 1e18;
    const mintFeesEvents = await options.getLogs({
        targets: vaults,
        eventAbi: "event MintFees(uint256 vaultManagerReceiverFee, uint256 strategyLogicReceiverFee, uint256 ecosystemRevenueReceiverFee, uint256 multisigReceiverFee)",
        flatten: false
    });

    const prices = await options.api.multiCall({
        abi: "function price() view returns (uint, bool)",
        calls: vaults.map(vault => ({
            target: vault,
        }))
    });

    mintFeesEvents.forEach((event: any, i: number) => {
        event.forEach((fee: any) => {
            const price = Number(prices[i][0]);
            fees.vaultManagerFee += Number(fee.vaultManagerReceiverFee) * price / DECIMALS;
            fees.strategyLogicFee += Number(fee.strategyLogicReceiverFee) * price / DECIMALS;
            fees.ecosystemFee += Number(fee.ecosystemRevenueReceiverFee) * price / DECIMALS;
            fees.multisigFee += Number(fee.multisigReceiverFee) * price / DECIMALS;
        })
    });
    dailyFees.addUSDValue(Number(fees.vaultManagerFee + fees.strategyLogicFee + fees.ecosystemFee + fees.multisigFee) / 1e18)

    return dailyFees;
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SONIC]: {
            fetch: fetch,
            start: '2024-12-24',
        },
    },
    methodology: {
        Fees: "Yield and management fees collected from managed assets and vaults.",
    },
}

export default adapter;
