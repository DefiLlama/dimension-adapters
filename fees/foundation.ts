import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
const market_address = '0xcda72070e455bb31c7690a170224ce43623d0b6f';
const nft_drop_market_address = '0x53f451165ba6fdbe39a134673d13948261b2334a';

const topic_0_reserveAuction_finalized = '0x2edb0e99c6ac35be6731dab554c1d1fa1b7beb675090dbb09fb14e615aca1c4a';
const topic_0_private_sale_finalized = '0x6c623fa5e13aaaf28288f807e5b4f9ec6fb7ef812568e00317c552663bea918f';
const topic_0_buyPrice_accepted = '0xd28c0a7dd63bc853a4e36306655da9f8c0b29ff9d0605bb976ae420e46a99930';
const topic_0_offer_accepted = '0x1cb8adb37d6d35e94cd0695ca39895b84371864713f5ca7eada52af9ff23744b'
const topic_0_mint_from_fixed_price_drop = '0x05ebbb6b0ce7d564230ba625dd7a0e5108786b0852d6060de6099e1778203e34'
const topic_0_withdraw_creator_revenue_from_dutch_auction = '0x5e16e96b4ba4fe46f3be73d54d1fa0da481494ab74c2d6e33328366d6437693c'

// todo: track new events
const fetch = async ({ createBalances, getLogs, }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  (await getLogs({
    target: market_address,
    topics: [topic_0_reserveAuction_finalized],
    eventAbi:  "event ReserveAuctionFinalized(uint256 indexed auctionId, address indexed seller, address indexed bidder, uint256 totalFees, uint256 creatorRev, uint256 sellerRev)",
  })).map((e: any) => {
    dailyFees.addGasToken(e.totalFees, "Reserve auction fees")
    dailyRevenue.addGasToken(e.totalFees - e.creatorRev, "Reserve auction revenue")
    dailySupplySideRevenue.addGasToken(e.creatorRev, "Reserve auction creator royalties")
  });

  (await getLogs({
    target: market_address,
    topics: [topic_0_private_sale_finalized],
    eventAbi: "event PrivateSaleFinalized(address indexed nftContract, uint256 indexed tokenId, address indexed seller, address buyer, uint256 f8nFee, uint256 creatorFee, uint256 ownerRev, uint256 deadline)"
  })).map((e: any) => {
    dailyFees.addGasToken(e.f8nFee, "Private sale fees")
    dailyFees.addGasToken(e.creatorFee, "Private sale creator royalties")
    dailyRevenue.addGasToken(e.f8nFee, "Private sale revenue")
    dailySupplySideRevenue.addGasToken(e.creatorFee, "Private sale creator royalties")
  });

  (await getLogs({
    target: market_address,
    topics: [topic_0_buyPrice_accepted],
    eventAbi: "event BuyPriceAccepted(address indexed nftContract, uint256 indexed tokenId, address indexed seller, address buyer, uint256 totalFees, uint256 creatorRev, uint256 sellerRev)"
  })).map((e: any) => {
    dailyFees.addGasToken(e.totalFees, "Buy price sale fees")
    dailyRevenue.addGasToken(e.totalFees - e.creatorRev, "Buy price sale revenue")
    dailySupplySideRevenue.addGasToken(e.creatorRev, "Buy price sale creator royalties")
  });

  (await getLogs({
    target: market_address,
    topics: [topic_0_offer_accepted],
    eventAbi: "event OfferAccepted(address indexed nftContract, uint256 indexed tokenId, address indexed buyer, address seller, uint256 totalFees, uint256 creatorRev, uint256 sellerRev)"
  })).map((e: any) => {
    dailyFees.addGasToken(e.totalFees, "Offer accepted fees")
    dailyRevenue.addGasToken(e.totalFees - e.creatorRev, "Offer accepted revenue")
    dailySupplySideRevenue.addGasToken(e.creatorRev, "Offer accepted creator royalties")
  });

  (await getLogs({
    target: nft_drop_market_address,
    topics: [topic_0_mint_from_fixed_price_drop],
    eventAbi: "event MintFromFixedPriceDrop (address indexed nftContract, address indexed buyer, uint256 indexed firstTokenId, uint256 count, uint256 totalFees, uint256 creatorRev)"
  })).map((e: any) => {
    dailyFees.addGasToken(e.totalFees, "Fixed price drop mint fees")
    dailyRevenue.addGasToken(e.totalFees - e.creatorRev, "Fixed price drop mint revenue")
    dailySupplySideRevenue.addGasToken(e.creatorRev, "Fixed price drop mint creator royalties")
  });

  (await getLogs({
    target: nft_drop_market_address,
    topics: [topic_0_withdraw_creator_revenue_from_dutch_auction],
    eventAbi: "event WithdrawCreatorRevenueFromDutchAuction (address indexed nftContract, uint256 clearingPrice, uint256 totalMintedCount, uint256 totalFees, uint256 creatorRev)"
  })).map((e: any) => {
    dailyFees.addGasToken(e.totalFees, "Dutch auction fees")
    dailyRevenue.addGasToken(e.totalFees - e.creatorRev, "Dutch auction revenue")
    dailySupplySideRevenue.addGasToken(e.creatorRev, "Dutch auction creator royalties")
  });

  return {
    dailyFees, dailyRevenue, dailySupplySideRevenue
  }
}


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2021-02-01',
    },
  },
  breakdownMethodology: {
    Fees: {
      "Reserve auction fees": "Platform fees collected from finalized reserve auctions on the Foundation marketplace.",
      "Private sale fees": "Foundation platform fees collected from finalized private sales.",
      "Buy price sale fees": "Platform fees collected when a buy-now price is accepted on the marketplace.",
      "Offer accepted fees": "Platform fees collected when an offer is accepted on the marketplace.",
      "Fixed price drop mint fees": "Platform fees collected from fixed price NFT drop mints.",
      "Dutch auction fees": "Platform fees collected from dutch auction NFT drops.",
    },
    Revenue: {
      "Reserve auction revenue": "Revenue from finalized reserve auctions retained by Foundation.",
      "Private sale revenue": "Revenue from finalized private sales retained by Foundation.",
      "Buy price sale revenue": "Revenue from buy-now price sales retained by Foundation.",
      "Offer accepted revenue": "Revenue from accepted offers retained by Foundation.",
      "Fixed price drop mint revenue": "Revenue from fixed price NFT drop mints retained by Foundation.",
      "Dutch auction revenue": "Revenue from dutch auction NFT drops retained by Foundation.",
    },
    SupplySideRevenue: {
      "Reserve auction creator royalties": "Creator royalties paid out from finalized reserve auctions.",
      "Private sale creator royalties": "Creator royalties paid out from finalized private sales.",
      "Buy price sale creator royalties": "Creator royalties paid out from buy-now price sales.",
      "Offer accepted creator royalties": "Creator royalties paid out from accepted offers.",
      "Fixed price drop mint creator royalties": "Creator royalties paid out from fixed price NFT drop mints.",
      "Dutch auction creator royalties": "Creator royalties paid out from dutch auction NFT drops.",
    },
  },
}

export default adapter;
