import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
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
  const { contract, asset } = chainConfig[options.chain]

  const logs = await options.getLogs({
    eventAbi: PURCHASE,
    target: contract,
  })
  logs.forEach((log) => {
    const protocolsCut = log.price / 40n
    dailyFees.add(asset, protocolsCut, "NFT Trading Fees")
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
    [CHAIN.BSC]: { start: '2021-04-12' },
    [CHAIN.POLYGON]: { start: '2022-01-11' },
    [CHAIN.FANTOM]: { start: '2022-02-17'}
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
      'NFT Trading Fees': '2.5% protocol cut from the seller on all transactions.',
    },
  },
};

export default adapters;
