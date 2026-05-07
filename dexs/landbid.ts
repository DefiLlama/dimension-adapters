import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json"

const WORLD_MINER = "0xbc25d77953425041C3f09ea4b731a873E00036EA";
const UNCX_UNVI3_LOCKER = "0x231278eDd38B00B07fBd52120CEf685B9BaEBCC1";
const LAND_WETH_UNIV3_LP = "0xf630370cBFEB1d04c5C7B564143010E8d30b4e10";
const PROTOCOL_LP_PROVIDER = "0x258007980c06Ae309851774cCd703023D91f4879";
const LAND_TOKEN = "0xB738b1568F08B0d6894a580Ef805E9298ebFaB46";

const CONQUER_EVENT =
    "event Conquer(uint8 indexed continentId,address indexed newHolder,address indexed prevHolder,uint256 price,uint256 prevHolderPayout,uint256 tokensAccrued)";

const LP_FEE_COLLECTED_EVENT = "event Collect (address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)"

const BASE_FEE_BPS = 10000;
const UNCX_FEE_SHARE = 2/100;

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const lpFeeBps = await options.api.call({
        target: WORLD_MINER,
        abi: "function lpFeeBps() view returns (uint256)",
    })

    const devFeeBps = await options.api.call({
        target: WORLD_MINER,
        abi: "function devFeeBps() view returns (uint256)",
    })

    const lpFees = Number(lpFeeBps) / BASE_FEE_BPS;
    const devFees = Number(devFeeBps) / BASE_FEE_BPS;

    const conquerEvents = await options.getLogs({
        target: WORLD_MINER,
        eventAbi: CONQUER_EVENT,
    });

    const lpFeesCollectedLogs = await options.getLogs({
        target: LAND_WETH_UNIV3_LP,
        eventAbi: LP_FEE_COLLECTED_EVENT,
    })

    for (const log of conquerEvents) {
        dailyVolume.addGasToken(log.price);
        dailyFees.addGasToken(Number(log.price) * devFees, METRIC.PROTOCOL_FEES);
        dailyFees.addGasToken(Number(log.price) * lpFees, "Fees to protocol owned liquidity");
    }

    const token0 = ADDRESSES.base.WETH;
    const token1 = LAND_TOKEN;

    for(const log of lpFeesCollectedLogs) {
        let lpfeeRatioReceivedByProtocol = 0;
        
        if(log.recipient === UNCX_UNVI3_LOCKER) lpfeeRatioReceivedByProtocol = 1 - UNCX_FEE_SHARE;
        else if(log.recipient === PROTOCOL_LP_PROVIDER) lpfeeRatioReceivedByProtocol = 1;
        else continue;

        dailyFees.addToken(token0, Number(log.amount0) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
        dailyFees.addToken(token1, Number(log.amount1) * lpfeeRatioReceivedByProtocol, METRIC.LP_FEES);
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
}

const methodology = {
    Volume: "Includes ETH paid by users when conquering continents in the Land Bid game and fees earned by providing liquidity to the uniswap pool",
    Fees: "Includes 15% of the land bid game conquer amount, of which 10% goes to protocol owned liquidity on uniswap and 5% goes to the team and fees earned by providing liquidity to the uniswap pool",
    Revenue: "Includes 15% of the land bid game conquer amount, of which 10% goes to protocol owned liquidity on uniswap and 5% goes to the team and fees earned by providing liquidity to the uniswap pool",
    ProtocolRevenue: "Includes 15% of the land bid game conquer amount, of which 10% goes to protocol owned liquidity on uniswap and 5% goes to the team and fees earned by providing liquidity to the uniswap pool",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.PROTOCOL_FEES]: "5% of the conquer amount goes to the team",
        [METRIC.LP_FEES]: "Fees earned by providing liquidity to the uniswap pool",
        "Fees to protocol owned liquidity": "10% of the conquer amount goes to protocol owned liquidity on uniswap",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "5% of the conquer amount goes to the team",
        [METRIC.LP_FEES]: "Fees earned by providing liquidity to the uniswap pool",
        "Fees to protocol owned liquidity": "10% of the conquer amount goes to protocol owned liquidity on uniswap",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "5% of the conquer amount goes to the team",
        [METRIC.LP_FEES]: "Fees earned by providing liquidity to the uniswap pool",
        "Fees to protocol owned liquidity": "10% of the conquer amount goes to protocol owned liquidity on uniswap",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: "2026-05-05",
    methodology,
    breakdownMethodology,
};

export default adapter;
