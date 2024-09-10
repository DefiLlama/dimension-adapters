import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { httpGet } from "../../utils/fetchURL";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getPrices } from "../../utils/prices";
import { BigNumber } from "bignumber.js"

const feesConfig = "https://raw.githubusercontent.com/solv-finance-dev/slov-protocol-defillama/main/solv-fees.json";

// The Graph
const graphUrlList = {
    ethereum: 'https://api.studio.thegraph.com/query/40045/solv-payable-factory-prod/version/latest',
    bsc: 'https://api.studio.thegraph.com/query/40045/solv-payable-factory-bsc/version/latest',
    arbitrum: 'https://api.studio.thegraph.com/query/40045/solv-payable-factory-arbitrum/version/latest',
    mantle: 'https://api.0xgraph.xyz/api/public/65c5cf65-bd77-4da0-b41c-cb6d237e7e2f/subgraphs/solv-payable-factory-mantle/-/gn',
    merlin: 'http://solv-subgraph-server-alb-694489734.us-west-1.elb.amazonaws.com:8000/subgraphs/name/solv-payable-factory-merlin',
}

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

    if (!contracts[options.chain]) {
        return {
            timestamp: new Date().getTime(),
        };
    }

    const dailyFees = await addTokensReceived({
        options,
        targets: contracts[options.chain]["protocolFees"].address,
        tokens: contracts[options.chain]["protocolFees"].token,
    });

    return {
        dailyFees,
    };
};

const pool: FetchV2 = async (options) => {
    const contracts: {
        [chain: Chain]: {
            [poolFees: string]: string[];
        }
    } = await httpGet(feesConfig);

    if (!contracts[options.chain]) {
        return {
            timestamp: new Date().getTime(),
        };
    }

    const pools = await getGraphData(contracts[options.chain]["poolFees"], options.chain);
    const concretes = await concrete(pools, options);

    const timestamp = getUniqStartOfTodayTimestamp(new Date());
    const yesterday = timestamp - 86400;
    let poolNavs: any[] = [];
    for (const pool of pools) {
        const [yesterdayNav, todayNav] = await options.api.multiCall({
            calls: [{
                target: pool.navOracle,
                params: [pool.poolId, yesterday],
            }, {
                target: pool.navOracle,
                params: [pool.poolId, timestamp],
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

    const prices = (await getPrices(poolBaseInfos.map((index: { currency: string; }) => `${options.chain}:${index.currency.toLowerCase()}`), timestamp));
    let dailyFeeUsd = 0;
    for (let i = 0; i < pools.length; i++) {
        const poolNav = poolNavs[i];
        const poolBaseInfo = poolBaseInfos[i];
        const totalValue = totalValues[i];
        const priceData = prices[`${options.chain}:${poolBaseInfo.currency.toLowerCase()}`];

        const total = BigNumber(totalValue)
            .div(BigNumber(10e18))
            .times(
                BigNumber(poolNav).dividedBy(BigNumber(10).pow(priceData.decimals))
            ).times(priceData.price);

        dailyFeeUsd = BigNumber(dailyFeeUsd).plus(total).toNumber();
    }

    return {
        dailyFees: dailyFeeUsd,
    };
}

async function getGraphData(poolId: string[], chain: Chain) {
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