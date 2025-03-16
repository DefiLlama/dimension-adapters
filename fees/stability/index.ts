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
        eventAbi: "event VaultAndStrategy(address indexed deployer, string vaultType, string strategyId, address vault, address strategy, string name, string symbol, address[] assets, bytes32 deploymentKey, uint256 vaultManagerTokenId)",
    });

    return logChunk.map(log => log[3]);
}

async function getFeeEvents(vaults: string[], options: FetchOptions): Promise<Balances> {
    const fees = {
        vaultManagerFee: 0n,
        strategyLogicFee: 0n,
        ecosystemFee: 0n,
        multisigFee: 0n
    }
    const dailyFees = options.createBalances();
    const DECIMALS = BigInt(10 ** 18);

    for (const vault of vaults) {
        const mintFeesEvents = await options.getLogs({
            target: vault,
            eventAbi: "event MintFees(uint256 vaultManagerReceiverFee, uint256 strategyLogicReceiverFee, uint256 ecosystemRevenueReceiverFee, uint256 multisigReceiverFee)",
        });
        //fees are distributed in vault shares
        //we can use vault price() to convert the shares to USD price is in 1e18
        let price = await options.api.call({
            target: vault,
            abi: "function price() view returns (uint, bool)"
        });
        const priceBI = BigInt(price[0]);
        //we can then convert the shares to USD
        //multiply each fee amount by pricePerShare and divide by 1e18 to get the USD value
        mintFeesEvents.forEach((event: any) => {
            fees.vaultManagerFee += BigInt(event.vaultManagerReceiverFee) * priceBI / DECIMALS;
            fees.strategyLogicFee += BigInt(event.strategyLogicReceiverFee) * priceBI / DECIMALS;
            fees.ecosystemFee += BigInt(event.ecosystemRevenueReceiverFee) * priceBI / DECIMALS;
            fees.multisigFee += BigInt(event.multisigReceiverFee) * priceBI / DECIMALS;
        })
    }

    const totalFees = fees.vaultManagerFee + fees.strategyLogicFee + fees.ecosystemFee + fees.multisigFee;
    dailyFees.addUSDValue(Number(totalFees) / 1e18);

    return dailyFees;
}

export default {
    version: 2,
    adapter: {
        [CHAIN.SONIC]: {
            fetch: fetch,
            start: '2024-12-24',
        },
    },
};