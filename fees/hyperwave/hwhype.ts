import { Interface } from "ethers";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

/**
 * Code is a loose fork of Veda adapter
 */

interface IBoringVault {
    vault: string;
    accountant: string;
    accountantAbiVersion: 1 | 2;
    startTimestamp: number;
}

const BoringVaults: { [key: string]: Array<IBoringVault> } = {
    [CHAIN.HYPERLIQUID]: [
        {
            vault: "0x4DE03cA1F02591B717495cfA19913aD56a2f5858",
            accountant: "0xCf9be8BF79ad26fdD7aA73f3dd5bA73eCDee2a32",
            accountantAbiVersion: 1,
            startTimestamp: 1754073000,
        },
    ],
};

const BoringVaultAbis = {
    //vault
    hook: "address:hook",
    decimals: "uint8:decimals",
    totalSupply: "uint256:totalSupply",

    // hook
    accountant: "address:accountant",

    // accountant
    base: "address:base",
    exchangeRateUpdated:
        "event ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime)",
    accountantState: {
        1: "function accountantState() view returns(address,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint32,uint16)",
        2: "function accountantState() view returns(address,uint96,uint128,uint128,uint96,uint16,uint16,uint64,bool,uint24,uint16,uint16)",
    },
};

const AccountantFeeRateBase = 1e4;

interface ExchangeRateUpdatedEvent {
    blockNumber: number;
    oldRate: bigint;
    newRate: bigint;
}

export async function getHwhypeFees(
    options: FetchOptions
): Promise<{
    dailyFees: sdk.Balances,
    dailyRevenue: sdk.Balances,
}> {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()

    const START_TIMESTAMP = options.startTimestamp;

    const allVaults = BoringVaults[options.chain];
    const vaults = allVaults.filter(
        (v) =>
            // only vaults that have startTimestamp after before START_TIMESTAMP are considered
            v.startTimestamp < START_TIMESTAMP
    );

    if (vaults) {
        const getDecimals: Array<string> = await options.api.multiCall({
            abi: BoringVaultAbis.decimals,
            calls: vaults.map((vault) => vault.vault),
        });
        const getAccountants: Array<string> = vaults.map(
            (vault) => vault.accountant
        );
        const getTokens: Array<string> = await options.api.multiCall({
            abi: BoringVaultAbis.base,
            calls: getAccountants,
        });

        for (let i = 0; i < vaults.length; i++) {
            const vault = vaults[i];
            const vaultRateBase = Number(10 ** Number(getDecimals[i]));
            const accountant = getAccountants[i];
            const token = getTokens[i];

            // get vaults rate updated events
            const lendingPoolContract: Interface = new Interface([
                BoringVaultAbis.exchangeRateUpdated,
            ]);
            const events: Array<ExchangeRateUpdatedEvent> = (
                await options.getLogs({
                    eventAbi: BoringVaultAbis.exchangeRateUpdated,
                    entireLog: true,
                    target: accountant,
                })
            ).map((log) => {
                const decodeLog: any = lendingPoolContract.parseLog(log);

                const event: any = {
                    blockNumber: Number(log.blockNumber),
                    oldRate: decodeLog.args[0],
                    newRate: decodeLog.args[1],
                };

                return event;
            });

            for (const event of events) {
                // newRate - oldRate
                const growthRate =
                    event.newRate > event.oldRate
                        ? Number(event.newRate - event.oldRate)
                        : 0;

                // console.log(event.blockNumber)

                // don't need to make calls if there isn't rate growth
                if (growthRate > 0) {
                    // get total staked in vault at the given block
                    // it's safe for performance because ExchangeRateUpdated events
                    // occur daily once
                    const totalSupplyAtUpdated = await options.api.call({
                        abi: BoringVaultAbis.totalSupply,
                        target: vault.vault,
                        block: event.blockNumber,
                    });
                    const getAccountantState = await options.api.call({
                        abi: BoringVaultAbis.accountantState[
                            vault.accountantAbiVersion
                        ],
                        target: accountant,
                        block: event.blockNumber,
                    });

                    let exchangeRate = vaultRateBase;
                    let performanceFeeRate = 0;
                    if (vault.accountantAbiVersion === 2) {
                        exchangeRate = Number(getAccountantState[4]);

                        // only version 2 vaults have performance fee config
                        performanceFeeRate =
                            Number(getAccountantState[11]) /
                            AccountantFeeRateBase;
                    } else {
                        exchangeRate = Number(getAccountantState[3]);
                    }

                    // rate is always greater than or equal 1
                    const totalDeposited =
                        (Number(totalSupplyAtUpdated) * Number(exchangeRate)) /
                        vaultRateBase;

                    const supplySideYield =
                        (totalDeposited * growthRate) / vaultRateBase;
                    const totalYield =
                        supplySideYield / (1 - performanceFeeRate);
                    const protocolFee = totalYield - supplySideYield;

                    dailyFees.add(token, totalYield);
                }
            }

            // get total asset are deposited in vault
            const totalSupply = await options.api.call({
                abi: BoringVaultAbis.totalSupply,
                target: vault.vault,
            });
            const getAccountantState = await options.api.call({
                abi: BoringVaultAbis.accountantState[
                    vault.accountantAbiVersion
                ],
                target: accountant,
            });

            const exchangeRate =
                vault.accountantAbiVersion === 1
                    ? Number(getAccountantState[3])
                    : Number(getAccountantState[4]);
            const paltformFeeRate =
                vault.accountantAbiVersion === 1
                    ? Number(getAccountantState[9])
                    : Number(getAccountantState[10]);

            const totalDeposited =
                (Number(totalSupply) * Number(exchangeRate)) / vaultRateBase;

            // platform fees changred by Veda per year of total assets in vault
            const yearInSecs = 365 * 24 * 60 * 60;
            const timespan =
                options.toApi.timestamp && options.fromApi.timestamp
                    ? Number(options.toApi.timestamp) -
                      Number(options.fromApi.timestamp)
                    : 86400;
            const platformFee =
                (totalDeposited *
                    (paltformFeeRate / AccountantFeeRateBase) *
                    timespan) /
                yearInSecs;

            dailyFees.add(token, platformFee);
            dailyRevenue.add(token, platformFee);
        }
    }

    return { dailyFees, dailyRevenue };
}
