import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const registry = '0x251be3a17af4892035c37ebf5890f4a4d889dcad'
const topic0 = '0xa6ae807740439025f50884311ce0f96f5c3809a8f7170f9459dab1b14c9d8afd'

const minters = [
  '0x0725D2B69e107a7404C98C98AAB7Ec9dBF7aF3C4',
  '0x243880832644839397725558B108dCf2aF12A58D',
  '0x732134D7f99b90C704d736B360dB45425073380f',
  '0x776023A4573bd972c4C3e2a76F611d3C2bef516E'
]

const burners = [
  '0x0725D2B69e107a7404C98C98AAB7Ec9dBF7aF3C4',
  '0x732134D7f99b90C704d736B360dB45425073380f',
  '0xf0F4F0B48BE34920Afef4Ed883cD3c947D7FfaCC',
  '0x66DbFf2Ce099d19b4E8C5Dc8B254EC7aeAF5E642'
]

const eventAbis = {
  approval: "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  tradeExecuted: "event TradeExecuted(address indexed bidder, address indexed asker, uint256 indexed nftTokenId, address erc20Token, uint256 amount, bytes tradeSignature, uint256 feeAccrued)"
}

const fetch = async (options: FetchOptions) => {
  const [fromBlock, _toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock()
  ])

  const toBlock = _toBlock - 100
  const dailyFees = options.createBalances()
  const dailyVolume = options.createBalances()
  const allowedAddresses = new Set([...minters, ...burners].map(a => a.toLowerCase()))

  console.log(fromBlock,toBlock)
  const feesDatas = await options.api.getLogs({ fromBlock, toBlock, topics: [topic0], eventAbi: eventAbis.tradeExecuted, noTarget: true, onlyArgs: true, skipCache: true, skipCacheRead: true })
  // feesDatas.forEach(({ erc20Token, feeAccrued }) => {
  //   dailyFees.add(erc20Token, feeAccrued)
  // })
  feesDatas
    .filter(({ bidder, asker }) =>
      allowedAddresses.has(bidder.toLowerCase()) ||
      allowedAddresses.has(asker.toLowerCase())
    )
    .forEach(({ erc20Token, feeAccrued }) => {
      dailyFees.add(erc20Token, feeAccrued)
    })



  return { dailyFees, dailyVolume }
}

const methodology = {
  Fees: "Fee paid by the user to execute the transaction.",
  Revenue: "Fee collected by the protocol upon execution of a trade",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.POLYGON],
  methodology,
};

export default adapter;