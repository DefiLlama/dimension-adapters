import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VEXY_MARKETPLACE_CONTRACT = "0x6b478209974BD27e6cf661FEf86C68072b0d6738";
const VEXY_OFFERS_CONTRACT = {
    'base': '0x2903ee1a9dc4C8230651004D11f733787A0f69c4',
    'optimism': '0xb0AC1514499E71e20fA6d9Eba6ef8c73a5f73E87'
};

const BUY_LISTING_ABI = "event BuyListing (uint256 indexed listingId,address indexed nftCollection, uint256 indexed nftId, address buyer, address currency, uint256 price, uint256 fee)";

const OFFER_SALE_ABI = "event OfferSale (uint256 indexed offerId, address seller, uint256 nftId, uint256 locked, uint256 duration, uint256 price, uint256 fee)";

const TOKEN = {
    'base': '0x940181a94a35a4569e4529a3cdfb74e38fd98631', //aero
    'optimism': '0x9560e827af36c94d2ac33a39bce1fe78631088db' //velo
};

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const buyLogs = await options.getLogs({
        target: VEXY_MARKETPLACE_CONTRACT,
        eventAbi: BUY_LISTING_ABI,
    });

    buyLogs.forEach(buy => {
        dailyFees.add(buy.currency, buy.fee);
    });

    const sellLogs = await options.getLogs({
        target: VEXY_OFFERS_CONTRACT[options.chain],
        eventAbi: OFFER_SALE_ABI,
    });

    sellLogs.forEach(sell => {
        dailyFees.add(TOKEN[options.chain], sell.fee);
    })

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const methodology = {
    Fees: "1% fee charged on each trade of veNft",
    Revenue: "All the fee is kept as revenue",
    ProtocolRevenue: "All the fee goes to the protocol",
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE, CHAIN.OPTIMISM],
    start: "2025-01-14",
    methodology
};

export default adapter;