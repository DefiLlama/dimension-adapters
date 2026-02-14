import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const PROTOCOL_FEE_LABEL = "Protocol fees";
const TAKER_FEE_LABEL = "Taker fees";
const MAKER_FEE_LABEL = "Maker fees";

const abis = {
  "Execution": "event Execution((address trader, uint256 id, uint256 amount, address collection, uint8 assetType) transfer, bytes32 orderHash, uint256 listingIndex, uint256 price, (address recipient, uint16 rate) makerFee, ((address recipient, uint16 rate) protocolFee, (address recipient, uint16 rate) takerFee) fees, uint8 orderType)",
  "Execution721MakerFeePacked": "event Execution721MakerFeePacked(bytes32 orderHash, uint256 tokenIdListingIndexTrader, uint256 collectionPriceSide, uint256 makerFeeRecipientRate)",
  "Execution721Packed": "event Execution721Packed(bytes32 orderHash, uint256 tokenIdListingIndexTrader, uint256 collectionPriceSide)",
  "Execution721TakerFeePacked": "event Execution721TakerFeePacked(bytes32 orderHash, uint256 tokenIdListingIndexTrader, uint256 collectionPriceSide, uint256 takerFeeRecipientRate)",
  "protocolFee": "function protocolFee() view returns (address recipient, uint16 rate)",
}

const unpackTypePriceCollection = (packedValue: any): any => {
  packedValue /= BigInt(2) ** BigInt(160);
  return Number(packedValue % BigInt(2) ** BigInt(88))
}


const unpackFeeRate = (packedValue: any) => {
  packedValue /= BigInt(2) ** BigInt(160);
  return packedValue.toString() / 1e4;
}

const fetch: any = async ({ getLogs, api, createBalances, }: FetchOptions) => {
  const marketplace = "0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5"
  const protocolFee = await api.call({  abi: abis.protocolFee, target: marketplace})
  const dailyFees = createBalances();
  const [executionLogs, execution721MakerFeePackedLogs, execution721TakerFeePackedLogs] = await Promise.all([
    abis.Execution, abis.Execution721MakerFeePacked, abis.Execution721TakerFeePacked
  ].map(eventAbi => getLogs({ target: marketplace, eventAbi })))

  executionLogs.forEach((log: any) => {
    const rate = Number(log.fees.takerFee.rate || 0) / 1e4;
    const price = Number(log.price);
    dailyFees.addGasToken(rate * price, TAKER_FEE_LABEL);
  })

  const protocolFeeRate = Number(protocolFee.rate) / 1e4;
  if (protocolFeeRate > 0) {
    const execution721PackedLogs = await getLogs({ target: marketplace, eventAbi: abis.Execution721Packed })
    execution721PackedLogs.forEach((log: any) => {
      const price = unpackTypePriceCollection(BigInt(log.collectionPriceSide));
      const rate = protocolFeeRate;
      dailyFees.addGasToken(rate * price, PROTOCOL_FEE_LABEL);
    })
  }

  execution721MakerFeePackedLogs.forEach((log: any) => {
    const price = unpackTypePriceCollection(BigInt(log.collectionPriceSide));
    const rate = unpackFeeRate(BigInt(log.makerFeeRecipientRate));
    dailyFees.addGasToken(rate * price, MAKER_FEE_LABEL);
  })

  execution721TakerFeePackedLogs.forEach((log: any) => {
    const price = unpackTypePriceCollection(BigInt(log.collectionPriceSide));
    const rate = unpackFeeRate(BigInt(log.takerFeeRecipientRate));
    dailyFees.addGasToken(rate * price, TAKER_FEE_LABEL);
  })

  const dailyRevenue = dailyFees;
  return { dailyFees, dailyRevenue }
}

const methodology = {
  Fees: "All fees collected from NFT trades on Blur marketplace, including protocol, maker, and taker fees",
  Revenue: "All fees are retained by the protocol"
}

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees charged on NFT trades, rate set by the protocol",
    [TAKER_FEE_LABEL]: "Fees paid by buyers (takers) when purchasing NFTs",
    [MAKER_FEE_LABEL]: "Fees paid by sellers (makers) when listing NFTs for sale"
  },
  Revenue: {
    [PROTOCOL_FEE_LABEL]: "Protocol fees retained by Blur from NFT trades",
    [TAKER_FEE_LABEL]: "Taker fees retained by Blur from NFT purchases",
    [MAKER_FEE_LABEL]: "Maker fees retained by Blur from NFT sales"
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-07-02'
    }
  },
  methodology,
  breakdownMethodology
}
export default adapter
