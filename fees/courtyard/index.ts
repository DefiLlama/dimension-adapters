import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const registry = '0x251be3a17af4892035c37ebf5890f4a4d889dcad'

const abis = {
  listTrustedOperatorRoleMembers: "function listTrustedOperatorRoleMembers() view returns (address[])",
  listTrustedForwarderRoleMembers: "function listTrustedForwarderRoleMembers() view returns (address[])",
  listMinterRoleMembers: "function listMinterRoleMembers() view returns (address[])",
}

const eventAbis = {
  tradeExecuted: "event TradeExecuted(address indexed bidder, address indexed asker, uint256 indexed nftTokenId, address erc20Token, uint256 amount, bytes tradeSignature, uint256 feeAccrued)",
  tokenPurchasedAndMinted: "event TokenPurchasedAndMinted(address indexed mintedToAddress, address mintedTokenAddress, uint256 mintedTokenId, address paymentTokenAddress, uint256 paymentAmount)",
}

const getMintedNFTs = async (minters: string [], options: FetchOptions, dailyFees: Balances, dailyRevenue: Balances) => {
  const datas = await options.getLogs({ targets: minters, eventAbi: eventAbis.tokenPurchasedAndMinted })
  return datas.map(({ paymentTokenAddress, paymentAmount }) => {
    dailyFees.add(paymentTokenAddress, paymentAmount * 6n / 100n)
    dailyRevenue.add(paymentTokenAddress, paymentAmount * 6n / 100n)
  })
}

const getMarketsPlaceDatas = async (allowedAddresses: string [], options: FetchOptions, dailyFees: Balances, dailyRevenue: Balances) => {
  const datas = await options.getLogs({ targets: allowedAddresses, eventAbi: eventAbis.tradeExecuted })
  return datas.map(({ erc20Token, feeAccrued }) => {
    dailyFees.add(erc20Token, feeAccrued)
    dailyRevenue.add(erc20Token, feeAccrued)
  })
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const listTrustedOperatorRoleMembers = await options.api.call({ target: registry, abi: abis.listTrustedOperatorRoleMembers })
  const listTrustedForwarderRoleMembers = await options.api.call({ target: registry, abi: abis.listTrustedForwarderRoleMembers })
  const listMinterRoleMembers = await options.api.call({ target: registry, abi: abis.listMinterRoleMembers })
  
  const allowedAddresses = [...new Set([...listTrustedOperatorRoleMembers, ...listTrustedForwarderRoleMembers].map(a => a.toLowerCase()))]
  await getMarketsPlaceDatas(allowedAddresses, options, dailyFees, dailyRevenue)
  await getMintedNFTs(listMinterRoleMembers.map((x: string) => x.toLowerCase()), options, dailyFees, dailyRevenue)

  return { dailyFees, dailyRevenue, dailyUserFees: dailyFees, dailyProtocolRevenue: dailyRevenue }
}

const methodology = {
  Fees: "Total fees from nfts (card pack sales) and marketplace transactions.",
  Revenue: "Revenue from nfts sales + marketplace fees/royalties.",
  UserFees: "Total fees paid by users for nfts and marketplace transactions.",
  ProtocolRevenue: "Net revenue after accounting for nfts buyback expenses."
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.POLYGON],
  methodology,
};

export default adapter;