
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi = {
  "NFTListed": "event NFTListed(address indexed nft, uint256 indexed tokenId, address seller, uint256 price)",
  "NFTSold": "event NFTSold(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price)",
  "NFTUnlisted": "event NFTUnlisted(address indexed nft, uint256 indexed tokenId)",
  "FEE_PERCENT": "uint256:FEE_PERCENT",
  "activeListings": "function activeListings(uint256) view returns (address nft, uint256 tokenId)",
  "buyNFT": "function buyNFT(address nft, uint256 tokenId) payable",
  "feeReceiver": "address:feeReceiver",
  "getActiveListingsLength": "uint256:getActiveListingsLength",
  "getAllActiveListingsFiltered": "function getAllActiveListingsFiltered() view returns (address[] nftAddresses, uint256[] tokenIds, address[] sellers, uint256[] prices)",
  "listNFT": "function listNFT(address nft, uint256 tokenId, uint256 price)",
  "listingIndex": "function listingIndex(address, uint256) view returns (uint256)",
  "listings": "function listings(address, uint256) view returns (address seller, uint256 price, bool isActive)",
  "owner": "address:owner",
  "unlistNFT": "function unlistNFT(address nft, uint256 tokenId)"
}

const contract = '0xb97cDe183139A434291F2C185c2a072c3b8EaE80'

async function fetch({ getLogs, api, createBalances, }: FetchOptions) {
  const fees = (await api.call({ target: contract, abi: abi.FEE_PERCENT })) / 100
  const logs = await getLogs({ target: contract, eventAbi: abi.NFTSold, })
  const dailyVolume = createBalances()
  dailyVolume.addGasToken(logs.map(i => i.price))
  return { dailyVolume, dailyFees: dailyVolume.clone(fees) }
}

export default {
  fetch,
  version: 2,
  pullHourly: true,
  start: '2025-06-27',
  chains: [CHAIN.XRPL_EVM],
  methodology: {
    Fees: "5% fee charged on all NFT marketplace sales",
    Volume: "Total volume of NFT sales on the marketplace"
  },
};
