import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { ethers } from "ethers";

const ABI = {
    AUCTION_SETTLED_EVENT: 'event AuctionSettled (uint256 indexed nounId, address winner, uint256 amount)',
    TRANSFER_EVENT: 'event Transfer (address indexed from,address indexed to,uint256 indexed tokenId)'
};

const ADDRESS = {
    NOUNS_DAO_AUCTION: '0x830BD73E4184ceF73443C15111a1DF14e495C706',
    NOUN_TOKEN: '0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03',
    NOUNDER_MULTISIG: '0x2573C60a6D127755aA2DC85e342F7da2378a0Cc5',
    NOUNS_DAO: "0xb1a32FC9F9D8b2cf86C068Cae13108809547ef71",
    TRANSFER_TOPIC: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
}

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();

    const auctionSettledLogs = await options.getLogs({
        target: ADDRESS.NOUNS_DAO_AUCTION,
        eventAbi: ABI.AUCTION_SETTLED_EVENT,
    });

    const noundersRewardLogs = await options.getLogs({
        target: ADDRESS.NOUN_TOKEN,
        eventAbi: ABI.TRANSFER_EVENT,
        topics: [
            ADDRESS.TRANSFER_TOPIC,
            ethers.zeroPadValue(ADDRESS.NOUNS_DAO, 32),
            ethers.zeroPadValue(ADDRESS.NOUNDER_MULTISIG, 32),
        ]
    });

    let latestSettlementPrice = 0n;

    auctionSettledLogs.forEach((settlement: any) => {
        latestSettlementPrice = settlement.amount;
        dailyFees.addToken(ADDRESSES.ethereum.WETH, latestSettlementPrice);
    });

    dailyFees.addToken(ADDRESSES.ethereum.WETH, latestSettlementPrice * BigInt(noundersRewardLogs.length));

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Nouns NFT auction proceeds received by treasury and every 10th Noun NFT received by Nounders' Multisig.",
    Revenue: "auction ETH proceeds goes to dao treasury.",
    ProtocolRevenue: "auction ETH proceeds goes to dao treasury.",
};

// Version 1 bcz auction settlement just once a day
const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    methodology,
    chains: [CHAIN.ETHEREUM],
    start: '2021-08-08'
}

export default adapter;
