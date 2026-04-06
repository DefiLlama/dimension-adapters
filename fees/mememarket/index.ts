import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics"
import coreAssets from "../../helpers/coreAssets.json"

const contracts = ["0x000000000000b03943bc5083d5516fea9f20fb71", "0x0000000000002BA88A3FD3E5ae86fd3d47c1fdd3"]
const MINT_EVENT = "event Mint(address indexed to, address indexed marketToken, address indexed marketCollection, uint256 mediaId, uint256 ethAmount, uint256 minterTokenAmount, uint256 creatorTokenAmount, address mediaCreator, address actor, string comment, uint256 previousPrice, uint256 newPrice)"
const BURN_EVENT = "event Burn(address indexed marketToken, address indexed from, uint256 indexed tokenAmount, uint256 totalEthFromBurn, uint256 burnerPayout, uint256 protocolPayout, string comment, uint256 previousPrice, uint256 newPrice)"

async function fetch(options: FetchOptions) {
    const { getLogs, createBalances } = options;
    const dailyFees = createBalances();
    const asset = coreAssets.base.WETH
    const [mints, burns] = await Promise.all([
        getLogs({ targets: contracts, eventAbi: MINT_EVENT }),
        getLogs({ targets: contracts, eventAbi: BURN_EVENT }),
    ])
    mints.forEach(mint => dailyFees.add(asset, mint.ethAmount / 100n, METRIC.TRADING_FEES))
    burns.forEach(burn => dailyFees.add(asset, burn.protocolPayout, METRIC.TRADING_FEES))
    return { dailyFees, dailyRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: "2024-02-20",
    deadFrom: "2024-12-02",
    methodology: {
        Fees: "Fees from minting (1%) and burning (1.5%) tokens on MemeMarket bonding curves.",
        Revenue: "All fees are collected by the protocol.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.TRADING_FEES]: "Fees from minting (1%) and burning (1.5%) tokens on MemeMarket bonding curves."
        },
        Revenue: {
            [METRIC.TRADING_FEES]: "All fees are collected by the protocol"
        }
    }
};

export default adapter;
