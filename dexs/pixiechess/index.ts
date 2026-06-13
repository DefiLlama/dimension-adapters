import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MINT_CONTRACT = '0xb3b4F451870B53586949f0AF4Ba754aaF8AeD4F3';
const VRGDA_DEPLOYER = '0xd2eE2d200d57007E6C62F29958bF43dc98075A47';

const PURCHASE_EVENT_ABI = 'event Purchased(address indexed buyer, uint256 firstCollectionTokenId, uint8 cardsPerPack, uint256 price)'
const MINT_EVENT_ABI = 'event Mint(uint256 pieceId, uint256 price)'
const VRDGA_DEPLOYED_EVENT_ABI = 'event VRDGADeployed (address contractAddress, uint256 pieceId, uint256 startTime, uint256 endTime)'

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();

    const vrgdaDeployedLogs = await options.getLogs({
        target: VRGDA_DEPLOYER,
        eventAbi: VRDGA_DEPLOYED_EVENT_ABI,
        fromBlock: 44174032,
        cacheInCloud: true,
    });

    const piecePurchasedLogs = await options.getLogs({
        target: MINT_CONTRACT,
        eventAbi: PURCHASE_EVENT_ABI,
    });

    const pieceMintedLogs = await options.getLogs({
        targets: vrgdaDeployedLogs.map(log => log.contractAddress),
        eventAbi: MINT_EVENT_ABI,
    });

    piecePurchasedLogs.forEach(log => {
        dailyVolume.addGasToken(log.price);
    });

    pieceMintedLogs.forEach(log => {
        dailyVolume.addGasToken(log.price);
    });

    return {
        dailyVolume,
    }

}

const methodology = {
    Volume: "Includes all PixieChess purchases and mints.",
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: "2026-04-02",
    methodology,
}

export default adapter;