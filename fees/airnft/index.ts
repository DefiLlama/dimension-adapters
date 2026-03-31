import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import coreAssets from "../../helpers/coreAssets.json";

const AIRNFT_CONTRACT = '0xF5db804101d8600c26598A1Ba465166c33CdAA4b'
const PURCHASE = 'event Purchase(address indexed previousOwner, address indexed newOwner, uint price, uint nftID, string uri)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    eventAbi: PURCHASE,
    target: AIRNFT_CONTRACT,
  })
  logs.forEach((log) => {
    const protocolsCut = Number(log.price) / 40
    dailyFees.add(coreAssets.bsc.WBNB, log.price, "NFT Trading Fees")
    dailyRevenue.add(coreAssets.bsc.WBNB, protocolsCut, METRIC.SERVICE_FEES)
    dailySupplySideRevenue.add(coreAssets.bsc.WBNB, Number(log.price) - protocolsCut, METRIC.CREATOR_FEES)
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
  chains: [CHAIN.BSC],
  start: '2021-11-15',
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
      [METRIC.CREATOR_FEES]: 'The remaining sale proceeds paid to NFT creators.',
    },
  },
};

export default adapters;
