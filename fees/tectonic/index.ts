import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { compoundV2Export } from "../../helpers/compoundV2";
import { CHAIN } from "../../helpers/chains";

const comptrollers: any = {
    [CHAIN.CRONOS]: [
        "0xb3831584acb95ed9ccb0c11f677b5ad01deaeec0",
        "0x8312A8d5d1deC499D00eb28e1a2723b13aA53C1e",
        "0x7E0067CEf1e7558daFbaB3B1F8F6Fa75Ff64725f",
    ]
};

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    await Promise.all(comptrollers[options.chain].map(async (comptroller: string) => {
        const { adapter } = compoundV2Export({ [options.chain]: comptroller });
        const data = await (adapter!.cronos.fetch! as any)(options);
        
        dailyFees.add(data.dailyFees);
        dailyRevenue.add(data.dailyRevenue);
        dailyHoldersRevenue.add(data.dailyHoldersRevenue);
        dailySupplySideRevenue.add(data.dailySupplySideRevenue);
    }));

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue
    }
}

const methodology = {
    Fees: "Total interest paid by borrowers",
    Revenue: "Protocol's share of interest treasury",
    ProtocolRevenue: "Protocol's share of interest into treasury",
    HoldersRevenue: "Share of interest into protocol governance token holders.",
    SupplySideRevenue: "Interest paid to lenders in liquidity pools",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.CRONOS],
    methodology,
    start: '2025-01-01'
}

export default adapter;