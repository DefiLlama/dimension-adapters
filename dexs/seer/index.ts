import { CHAIN } from "../../helpers/chains";
import { Chain, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { ethers } from "ethers";
import { BytesLike } from "ethers";

interface chainAddressInterface {
    conditionalTokens: string
    router: string,
    futarchyRouter?: string
}

const chainAddresses : Record<Chain, chainAddressInterface> = {
    [CHAIN.XDAI]: {
        conditionalTokens: "0xCeAfDD6bc0bEF976fdCd1112955828E00543c0Ce",
        router: "0xeC9048b59b3467415b1a38F63416407eA0c70fB8",
        futarchyRouter: "0xE2996f6BC88ba0f2Ad3a6E2A71ac55884ec9F74E"
    },
    [CHAIN.ETHEREUM]: {
        conditionalTokens: "0xC59b0e4De5F1248C1140964E0fF287B192407E0C",
        router: "0x886Ef0A78faBbAE942F1dA1791A8ed02a5aF8BC6"
    }
}
const positionSplit = "event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)"
const positionMerge = "event PositionsMerge(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)"

async function fetch(options: FetchOptions) {
    const { conditionalTokens, router, futarchyRouter } = chainAddresses[options.chain]
    const dailyVolume = options.createBalances()

    const [splits, merges] = await Promise.all([
        options.getLogs({ target: conditionalTokens, eventAbi: positionSplit, topics: ["0x2e6bb91f8cbcda0c93623c54d0403a43514fabc40084ec96b6d5379a74786298", ethers.zeroPadValue(router as BytesLike, 32), null as any, null as any] }),
        options.getLogs({ target: conditionalTokens, eventAbi: positionMerge, topics: ["0x6f13ca62553fcc2bcd2372180a43949c1e4cebba603901ede2f4e14f36b282ca", ethers.zeroPadValue(router as BytesLike, 32), null as any, null as any] }),
    ])
    let futarchyLogs = []
    if (futarchyRouter) {
        const [futarchySplits, futarchyMerges] = await Promise.all([
        options.getLogs({ target: conditionalTokens, eventAbi: positionSplit, topics: ["0x2e6bb91f8cbcda0c93623c54d0403a43514fabc40084ec96b6d5379a74786298", ethers.zeroPadValue(futarchyRouter as BytesLike, 32), null as any, null as any] }),
        options.getLogs({ target: conditionalTokens, eventAbi: positionMerge, topics: ["0x6f13ca62553fcc2bcd2372180a43949c1e4cebba603901ede2f4e14f36b282ca", ethers.zeroPadValue(futarchyRouter as BytesLike, 32), null as any, null as any] }),
    ])
    futarchyLogs = futarchySplits.concat(futarchyMerges)
    }
    splits.concat(merges).concat(futarchyLogs).forEach(log => {
        dailyVolume.add(log.collateralToken, log.amount)
    })

    return {
        dailyVolume
    }
}

const adapter : SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    start: "2024-08-04",
    chains: [CHAIN.XDAI, CHAIN.ETHEREUM]
}

export default adapter