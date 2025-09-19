import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const registry = '0x251be3a17af4892035c37ebf5890f4a4d889dcad'
const topic0_transfers = '0xa6ae807740439025f50884311ce0f96f5c3809a8f7170f9459dab1b14c9d8afd'
const topic0_mint = '0x3ac06088fd2f047b705cf81c76a5be8b7d378860415de575a9974868ca188980'

const abis = {
  listTrustedOperatorRoleMembers: "function listTrustedOperatorRoleMembers() view returns (address[])",
  listTrustedForwarderRoleMembers: "function listTrustedForwarderRoleMembers() view returns (address[])",
  listMinterRoleMembers: "function listMinterRoleMembers() view returns (address[])",
}

const eventAbis = {
  approval: "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  tradeExecuted: "event TradeExecuted(address indexed bidder, address indexed asker, uint256 indexed nftTokenId, address erc20Token, uint256 amount, bytes tradeSignature, uint256 feeAccrued)",
  tokenPurchasedAndMinted: "event TokenPurchasedAndMinted(address indexed mintedToAddress, address mintedTokenAddress, uint256 mintedTokenId, address paymentTokenAddress, uint256 paymentAmount)",
}

const getMintedNFTs = async (minters: string [], options: FetchOptions, fromBlock: number, toBlock: number, dailyFees: Balances, dailyRevenue: Balances) => {
  const datas = await options.api.getLogs({ targets: minters, fromBlock, toBlock, topics: [topic0_mint], eventAbi: eventAbis.tokenPurchasedAndMinted, onlyArgs: true })
  return datas.map(({ paymentTokenAddress, paymentAmount }) => {
    dailyFees.add(paymentTokenAddress, paymentAmount * 6n / 100n)
    dailyRevenue.add(paymentTokenAddress, paymentAmount * 6n / 100n)
  })
}

const getMarketsPlaceDatas = async (allowedAddresses: string [], options: FetchOptions, fromBlock: number, toBlock: number, dailyFees: Balances, dailyRevenue: Balances) => {
  const datas = await options.api.getLogs({ targets: allowedAddresses, fromBlock, toBlock, topics: [topic0_transfers], eventAbi: eventAbis.tradeExecuted, onlyArgs: true })
  return datas.map(({ erc20Token, feeAccrued }) => {
    dailyFees.add(erc20Token, feeAccrued)
    dailyRevenue.add(erc20Token, feeAccrued)
  })
}

const fetch = async (options: FetchOptions) => {
  const [listTrustedOperatorRoleMembers, listTrustedForwarderRoleMembers, listMinterRoleMembers, fromBlock, _toBlock] = await Promise.all([
    options.api.call({ target: registry, abi: abis.listTrustedOperatorRoleMembers }),
    options.api.call({ target: registry, abi: abis.listTrustedForwarderRoleMembers }),
    options.api.call({ target: registry, abi: abis.listMinterRoleMembers }),
    options.getFromBlock(),
    options.getToBlock()
  ])

  const allowedAddresses = [...new Set([...listTrustedOperatorRoleMembers, ...listTrustedForwarderRoleMembers].map(a => a.toLowerCase()))]
  const toBlock = _toBlock - 100 // safeBlock query
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  await getMarketsPlaceDatas(allowedAddresses, options, fromBlock, toBlock, dailyFees, dailyRevenue)
  await getMintedNFTs(listMinterRoleMembers.map((x: string) => x.toLowerCase()), options, fromBlock, toBlock, dailyFees, dailyRevenue)

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