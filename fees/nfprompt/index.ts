import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json";

const MARKETPLACE = '0x27b0F2B249D48a0f48ae874646267872Dc209EDe'
const ITEM_BOUGHT_EVENT = 'event ItemBought(address indexed buyer, address seller, address indexed nftAddress, uint256 indexed tokenId, uint256 price)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    eventAbi: ITEM_BOUGHT_EVENT,
    target: MARKETPLACE,
  })
  logs.forEach((log) => {
    const protocolsCut = log.price / 40n
    dailyFees.add(coreAssets.bsc.WBNB, protocolsCut, "NFT Trading Fees")
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BSC]: { start: '2023-06-27' },
  },
  methodology: {
    Fees: "2.5% fee on all NFT marketplace transactions",
    Revenue: "The protocol takes a 2.5% cut from the seller on all transactions",
    ProtocolRevenue: "The protocol takes a 2.5% cut from the seller on all transactions",
  },
  breakdownMethodology: {
    Fees: {
      'NFT Trading Fees': '2.5% fee on all NFT marketplace transactions.',
    },
    Revenue: {
      "NFT Trading Fees": '2.5% protocol cut from the seller on all transactions.',
    },
  },
};

export default adapters;
