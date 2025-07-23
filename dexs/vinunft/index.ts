import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TokenPurchasedAbi = 'event TokenPurchased(address indexed nftAddress, uint256 indexed tokenId, address indexed seller, address buyer, uint256 listingId, uint256 amount, address paymentToken, uint256 price)'

const MARKETPLACE = '0xcA396A95E0EB8B6804e25F9db131780a60564047'

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();

  const saleLogs = await getLogs({ target: MARKETPLACE, eventAbi: TokenPurchasedAbi, });

  saleLogs.map(log => {
    dailyVolume.addToken(log.paymentToken, Number(log.price.toString()) * Number(log.amount.toString()));
  })

  return { dailyVolume, };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.VINUCHAIN]: { fetch, start: '2024-06-01' }
  }
};

export default adapter;
