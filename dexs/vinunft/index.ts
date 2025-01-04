import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_purchased = 'event TokenPurchased(address indexed _nftAddress, uint256 indexed _tokenId, address indexed _seller, address _buyer, uint256 _listingId, uint256 _amount, address _paymentToken, uint256 _price)'

const MARKETPLACE = '0xcA396A95E0EB8B6804e25F9db131780a60564047'

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();

  const saleLogs = await getLogs({
    target: MARKETPLACE,
    eventAbi: event_purchased,
    fromBlock: 5000,
    cacheInCloud: true,
  });

  await Promise.all(saleLogs.map(async log => {
    const { _amount, _paymentToken, _price } = log;
    dailyVolume.addToken(_paymentToken, _price * _amount);
  }
  ))

  return { dailyVolume, };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.VINUCHAIN]: { fetch, start: '2024-06-01' }
  }
};

export default adapter;
