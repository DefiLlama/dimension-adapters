import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import coreAssets from "../../helpers/coreAssets.json";

interface chainData {
    contract: string;
    asset: string;
}

const chainConfig : Record<string, chainData> = {
    [CHAIN.BSC]: {contract: '0xF5db804101d8600c26598A1Ba465166c33CdAA4b', asset: coreAssets.bsc.WBNB},
    [CHAIN.POLYGON]: {contract: '0xCd494673999194365033D7A287af9f0a3b163874', asset: coreAssets.polygon.WMATIC},
    [CHAIN.FANTOM]: {contract: '0x94e22c14118353651636f9af43cd0a5a08b93da3', asset: coreAssets.fantom.WFTM},

}
const PURCHASE = 'event Purchase(address indexed previousOwner, address indexed newOwner, uint price, uint nftID, string uri)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { contract, asset } = chainConfig[options.chain]

  const logs = await options.getLogs({
    eventAbi: PURCHASE,
    target: contract,
  })
  logs.forEach((log) => {
    const protocolsCut = Number(log.price) / 40
    dailyFees.add(asset, log.price, "NFT Trading Fees")
    dailyRevenue.add(asset, protocolsCut, METRIC.SERVICE_FEES)
    dailySupplySideRevenue.add(asset, Number(log.price) - protocolsCut, METRIC.CREATOR_FEES)
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
    [CHAIN.BSC]: { start: '2021-04-12' },
    [CHAIN.POLYGON]: { start: '2022-01-11' },
    [CHAIN.FANTOM]: { start: '2022-02-17'}
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
      [METRIC.CREATOR_FEES]: 'The remaining sale proceeds paid to NFT creators.',
    },
  },
};

export default adapters;
