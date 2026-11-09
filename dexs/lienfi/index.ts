import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const NFT_PURCHASED_EVENT = "event LienNFTPurchased (uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price)";
const MARKETPLACE_CONTRACT = "0xB6DC89341E6724D78A4644cEeA4491442697B4ff";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const nftPurchasedLogs = await options.getLogs({
    target: MARKETPLACE_CONTRACT,
    eventAbi: NFT_PURCHASED_EVENT,
  })

  for (const log of nftPurchasedLogs) {
    dailyVolume.add(ADDRESSES.base.USDC, log.price);
  }

  return {
    dailyVolume
  }
}

const methodology = {
  Volume: "Volume of real-estate NFTs purchased on LienFi.",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  chains: [CHAIN.BASE],
  start: "2026-05-08",
}

export default adapter;