import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import coreAssets from "../../helpers/coreAssets.json";


const MARKETPLACE = '0x27b0F2B249D48a0f48ae874646267872Dc209EDe'
const ITEM_BOUGHT_EVENT = 'event ItemBought(address indexed buyer, address seller, address indexed nftAddress, uint256 indexed tokenId, uint256 price)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    eventAbi: ITEM_BOUGHT_EVENT,
    target: MARKETPLACE,
  })
  logs.forEach((log) => {
    const protocolsCut = log.price / 40n
    dailyFees.add(coreAssets.bsc.WBNB, log.price, "NFT Trading Fees")
    dailyRevenue.add(coreAssets.bsc.WBNB, protocolsCut, METRIC.SERVICE_FEES)
    dailySupplySideRevenue.add(coreAssets.bsc.WBNB, log.price - protocolsCut, "Seller Proceeds")
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
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
    Fees: "NFT trading fees on all marketplace transactions",
    Revenue: "The protocol takes a 2.5% cut from the seller on all transactions",
    ProtocolRevenue: "The protocol takes a 2.5% cut from the seller on all transactions",
    SupplySideRevenue: "The remaining sale proceeds paid to NFT creators",
  },
  breakdownMethodology: {
    Fees: {
      'NFT Trading Fees': 'Full sale price of NFT marketplace transactions.',
    },
    Revenue: {
      [METRIC.SERVICE_FEES]: '2.5% protocol cut from the seller on all transactions.',
    },
    SupplySideRevenue: {
      "Seller Proceeds": 'The remaining sale proceeds paid to NFT creators.',
    },
  },
};

export default adapters;
