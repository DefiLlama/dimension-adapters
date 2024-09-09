import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, FetchV2, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { httpGet } from "../../utils/fetchURL";

const feesConfig = "https://raw.githubusercontent.com/solv-finance-dev/slov-protocol-defillama/main/solv-fees.json";

const chains: {
    [chain: Chain]: { deployedAt: number };
} = {
    [CHAIN.ETHEREUM]: {
        deployedAt: 1718236800,
    }
};

const protocol: FetchV2 = async (options) => {
    const contracts: {
        [chain: Chain]: {
            [protocolFees: string]: { address: string[]; token: string[]; deployedAt: number };
        }
    } = await httpGet(feesConfig);

    const dailyFees = await addTokensReceived({
        options,
        targets: contracts[options.chain]["protocolFees"].address,
        tokens: contracts[options.chain]["protocolFees"].token,
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const pool: FetchV2 = async (options) => {
    const dailyFees = options.createBalances();

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
}

const adapter: BreakdownAdapter = { breakdown: {}, version: 2 };

Object.keys(chains).forEach((chain: Chain) => {
    adapter.breakdown = {
        protocolFees: {
            [chain]: {
                fetch: protocol,
                start: chains[chain].deployedAt,
            }
        },
        poolFees: {
            [chain]: {
                fetch: pool,
                start: chains[chain].deployedAt,
            }
        }
    }
});

export default adapter;