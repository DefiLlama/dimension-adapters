import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const abis = {
  Execution: "event Execution((address trader, uint256 id, uint256 amount, address collection, uint8 assetType) transfer, bytes32 orderHash, uint256 listingIndex, uint256 price, (address recipient, uint16 rate) makerFee, ((address recipient, uint16 rate) protocolFee, (address recipient, uint16 rate) takerFee) fees, uint8 orderType)",
  Execution721MakerFeePacked: "event Execution721MakerFeePacked(bytes32 orderHash, uint256 tokenIdListingIndexTrader, uint256 collectionPriceSide, uint256 makerFeeRecipientRate)",
  Execution721Packed: "event Execution721Packed(bytes32 orderHash, uint256 tokenIdListingIndexTrader, uint256 collectionPriceSide)",
  Execution721TakerFeePacked: "event Execution721TakerFeePacked(bytes32 orderHash, uint256 tokenIdListingIndexTrader, uint256 collectionPriceSide, uint256 takerFeeRecipientRate)",
};

const unpackPrice = (packedValue: any): bigint => {
  packedValue = BigInt(packedValue);
  packedValue /= BigInt(2) ** BigInt(160);
  return packedValue % BigInt(2) ** BigInt(88);
};

const marketplace = "0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();

  const [executionLogs, execution721MakerFeeLogs, execution721PackedLogs, execution721TakerFeeLogs] = await Promise.all([
    abis.Execution, abis.Execution721MakerFeePacked, abis.Execution721Packed, abis.Execution721TakerFeePacked,
  ].map(eventAbi => getLogs({ target: marketplace, eventAbi })));

  executionLogs.forEach((log: any) => dailyVolume.addGasToken(log.price));

  execution721PackedLogs.forEach((log: any) => dailyVolume.addGasToken(unpackPrice(log.collectionPriceSide)));
  execution721MakerFeeLogs.forEach((log: any) => dailyVolume.addGasToken(unpackPrice(log.collectionPriceSide)));
  execution721TakerFeeLogs.forEach((log: any) => dailyVolume.addGasToken(unpackPrice(log.collectionPriceSide)));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2023-07-02" },
  },
};

export default adapter;
