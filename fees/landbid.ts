import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { CHAIN } from "../helpers/chains";

const WORLD_MINER = "0xbc25d77953425041C3f09ea4b731a873E00036EA";

const CONQUER_EVENT =
    "event Conquer(uint8 indexed continentId,address indexed newHolder,address indexed prevHolder,uint256 price,uint256 prevHolderPayout,uint256 tokensAccrued)";

const BASE_FEE_BPS = 10000;

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

    for (const log of conquerEvents) {
        dailyVolume.addGasToken(log.price);
        dailyFees.addGasToken(Number(log.price) * devFees, METRIC.PROTOCOL_FEES);
        dailyFees.addGasToken(Number(log.price) * lpFees, "Fees to protocol owned liquidity");
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
}

const methodology = {
    Volume: "ETH paid by users when conquering continents in the Land Bid game.",
    Fees: "15% of the conquer amount is fees, of which 10% goes to protocol owned liquidity on uniswap and 5% goes to the team",
    Revenue: "15% of the conquer amount is revenue, of which 10% goes to protocol owned liquidity on uniswap and 5% goes to the team",
    ProtocolRevenue: "15% of the conquer amount is protocol revenue, of which 10% goes to protocol owned liquidity on uniswap and 5% goes to the team",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.PROTOCOL_FEES]: "5% of the conquer amount goes to the team",
        "Fees to protocol owned liquidity": "10% of the conquer amount goes to protocol owned liquidity on uniswap",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "5% of the conquer amount goes to the team",
        "Fees to protocol owned liquidity": "10% of the conquer amount goes to protocol owned liquidity on uniswap",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "5% of the conquer amount goes to the team",
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
