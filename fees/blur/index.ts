import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

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
    dailyFees.addGasToken(rate * price);
  })

  const protocolFeeRate = Number(protocolFee.rate) / 1e4;
  if (protocolFeeRate > 0) {
    const execution721PackedLogs = await getLogs({ target: marketplace, eventAbi: abis.Execution721Packed })
    execution721PackedLogs.forEach((log: any) => {
      const price = unpackTypePriceCollection(BigInt(log.collectionPriceSide));
      const rate = protocolFeeRate;
      dailyFees.addGasToken(rate * price);
    })
  }

  execution721MakerFeePackedLogs.forEach((log: any) => {
    const price = unpackTypePriceCollection(BigInt(log.collectionPriceSide));
    const rate = unpackFeeRate(BigInt(log.makerFeeRecipientRate));
    dailyFees.addGasToken(rate * price);
  })

  execution721TakerFeePackedLogs.forEach((log: any) => {
    const price = unpackTypePriceCollection(BigInt(log.collectionPriceSide));
    const rate = unpackFeeRate(BigInt(log.takerFeeRecipientRate));
    dailyFees.addGasToken(rate * price);
  })

  return { dailyFees }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-07-02'
    }
  },
  version: 2
}
export default adapter
