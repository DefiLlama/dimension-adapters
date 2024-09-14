import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { addTokensReceived } from "../../helpers/token";
import { httpGet } from "../../utils/fetchURL";
import { gql, request } from "graphql-request";
import { getPrices } from "../../utils/prices";
import { BigNumber } from "bignumber.js"
import { Balances } from "@defillama/sdk";

const feesConfig = "https://raw.githubusercontent.com/solv-finance-dev/slov-protocol-defillama/main/solv-fees.json";
const graphUrl = "https://raw.githubusercontent.com/solv-finance-dev/slov-protocol-defillama/refs/heads/main/solv-graph.json";
const yields = 0.2;

const chains: {
    [chain: Chain]: { deployedAt: number };
} = {
    [CHAIN.ETHEREUM]: {
        deployedAt: 1681084800,
    },
    [CHAIN.BSC]: {
        deployedAt: 1679097600,
    },
    [CHAIN.ARBITRUM]: {
        deployedAt: 1682380800,
    },
    [CHAIN.MANTLE]: {
        deployedAt: 1692835200,
    },
    [CHAIN.MERLIN]: {
        deployedAt: 1710892800,
    },
    [CHAIN.CORE]: {
        deployedAt: 1726012800,
    },
};

const fetch: FetchV2 = async (options) => {
    const contracts: {
        [chain: Chain]: {
            [protocolFees: string]: { address: string[]; token: string[]; deployedAt: number };
        }
    } = await httpGet(feesConfig);

    if (!contracts[options.chain]) {
        return {
            timestamp: new Date().getTime(),
        };
    }

    const dailyFees = options.createBalances();
    const protocolFees = await protocol(options, contracts);
    dailyFees.addBalances(protocolFees);

    const poolFees = await pool(options, contracts);
    dailyFees.addBalances(poolFees);
    return {
        dailyFees,
        dailyRevenue: dailyFees.clone(yields)
    }
};

async function protocol(options: FetchOptions, contracts: any): Promise<Balances> {
    if (!contracts[options.chain]["protocolFees"]) {
        return options.createBalances();
    }
    const dailyFees = await addTokensReceived({
        options,
        targets: contracts[options.chain]["protocolFees"].address,
        tokens: contracts[options.chain]["protocolFees"].token,
    });

    return dailyFees;
}

async function pool(options: FetchOptions, contracts: any): Promise<Balances> {
    if (!contracts[options.chain]["poolFees"]) {
        return options.createBalances();
    }
    const pools = await getGraphData(contracts[options.chain]["poolFees"], options.chain);
    const concretes = await concrete(pools, options);

    const fromTimestamp = getTimestampAtStartOfDayUTC(options.fromTimestamp);
    const toTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

    let poolNavs: any[] = [];
    for (const pool of pools) {
        const [todayNav, yesterdayNav] = await options.api.multiCall({
            calls: [{
                target: pool.navOracle,
                params: [pool.poolId, toTimestamp],
            }, {
                target: pool.navOracle,
                params: [pool.poolId, fromTimestamp],
            }],
            abi: 'function getSubscribeNav(bytes32 poolId_, uint256 time_) view returns (uint256 nav_, uint256 navTime_)',
        });

        let nav = todayNav.nav_ - yesterdayNav.nav_;
        if (nav < 0) {
            nav = 0;
        }

        poolNavs.push(nav);
    }

    const poolBaseInfos = await options.api.multiCall({
        abi: `function slotBaseInfo(uint256 slot_) view returns (tuple(address issuer, address currency, uint64 valueDate, uint64 maturity, uint64 createTime, bool transferable, bool isValid))`,
        calls: pools.map((index: { contractAddress: string | number; openFundShareSlot: any; }) => ({
            target: concretes[index.contractAddress],
            params: [index.openFundShareSlot]
        })),
    });

    const totalValues = await options.api.multiCall({
        abi: 'function slotTotalValue(uint256) view returns (uint256)',
        calls: pools.map((index: { contractAddress: string | number; openFundShareSlot: any; }) => ({
            target: concretes[index.contractAddress],
            params: [index.openFundShareSlot]
        })),
    });

    const poolDecimalList = await options.api.multiCall({
        abi: "uint8:decimals",
        calls: poolBaseInfos.map(i => i[1]),
    })

    const dailyFees = options.createBalances();
    for (let i = 0; i < pools.length; i++) {
        const poolNav = poolNavs[i];
        const poolBaseInfo = poolBaseInfos[i];
        const totalValue = totalValues[i];
        const decimals = poolDecimalList[i];

        const token = `${options.chain}:${poolBaseInfo.currency}`;
        const total = BigNumber(totalValue)
            .dividedBy(BigNumber(10).pow(18))
            .times(BigNumber(10).pow(decimals))
            .times(
                BigNumber(poolNav).dividedBy(BigNumber(10).pow(decimals))
            );

        dailyFees.addBalances({ [token]: total.toNumber() });
    }

    return dailyFees;
}

async function getGraphData(poolId: string[], chain: Chain) {
    const graphUrlList: {
        [chain: Chain]: string;
    } = (await httpGet(graphUrl))
    const query = gql`{
              poolOrderInfos(first: 1000  where:{poolId_in: ${JSON.stringify(poolId)}}) {
                marketContractAddress
                contractAddress
                navOracle
                poolId
                vault
                openFundShareSlot
            }
          }`;
    let response: any;
    if (graphUrlList[chain]) {
        response = (await request(graphUrlList[chain], query)).poolOrderInfos;
    }

    return response;
}


async function concrete(slots: any[], options: FetchOptions): Promise<any> {
    var slotsList: any[] = [];
    var only = {};
    for (var i = 0; i < slots.length; i++) {
        if (!only[slots[i].contractAddress]) {
            slotsList.push(slots[i]);
            only[slots[i].contractAddress] = true;
        }
    }

    const concreteLists = await options.api.multiCall({
        calls: slotsList.map((index) => index.contractAddress),
        abi: 'address:concrete',
    })

    let concretes = {};
    for (var k = 0; k < concreteLists.length; k++) {
        concretes[slotsList[k].contractAddress] = concreteLists[k];
    }

    return concretes;
}

const adapter: SimpleAdapter = { adapter: {}, version: 2 };

Object.keys(chains).forEach((chain: Chain) => {
    adapter.adapter[chain] = {
        fetch,
        start: chains[chain].deployedAt,
    };
});

export default adapter;