import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const SALE_FEE_PAID_EVENT = "event SaleFeePaid (uint256 indexed tokenId, address indexed buyer, address indexed treasury, uint256 feeAmount, uint256 feeVersion)";
const INTEREST_FEE_PAID_EVENT = "event InterestFeePaid(uint256 indexed tokenId, address indexed owner, address indexed treasury, uint256 feeAmount, uint256 feeVersion)";
const MARKETPLACE_CONTRACT = "0xB6DC89341E6724D78A4644cEeA4491442697B4ff";
const INTEREST_FEE_PROTOCOL_SHARE = 0.1;

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const saleFeePaidLogs = await options.getLogs({
    target: MARKETPLACE_CONTRACT,
    eventAbi: SALE_FEE_PAID_EVENT,
  })

  const interestFeePaidLogs = await options.getLogs({
    target: MARKETPLACE_CONTRACT,
    eventAbi: INTEREST_FEE_PAID_EVENT,
  })

  for (const log of saleFeePaidLogs) {
    dailyFees.add(ADDRESSES.base.USDC, log.feeAmount, "Property Sale Fees");
    dailyRevenue.add(ADDRESSES.base.USDC, log.feeAmount, "Property Sale Fees to Protocol");
  }

  for (const log of interestFeePaidLogs) {
    const totalInterest = Number(log.feeAmount) * (1 / INTEREST_FEE_PROTOCOL_SHARE)
    dailyFees.add(ADDRESSES.base.USDC, totalInterest, "Property Interest");
    dailyRevenue.add(ADDRESSES.base.USDC, log.feeAmount, "Property Interest to Protocol");
    dailySupplySideRevenue.add(ADDRESSES.base.USDC, totalInterest - Number(log.feeAmount), "Property Interest to NFT Owners");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Includes 2% property NFT sale fees and interest earned from property NFTs.",
  Revenue: "Includes 2% property NFT sale fees and 10% of interest earned from property NFTs.",
  ProtocolRevenue: "Includes 2% property NFT sale fees and 10% of interest earned from property NFTs.",
  SupplySideRevenue: "Includes 90% of interest earned from property NFTs paid to NFT owners.",
}

const breakdownMethodology = {
  Fees: {
    "Property Sale Fees": "2% of the sale price of the property NFT.",
    "Property Interest": "Net interest earned on property NFTs realised during redemption.",
  },
  Revenue: {
    "Property Sale Fees to Protocol": "2% of the sale price of the property NFT.",
    "Property Interest to Protocol": "Net interest earned on property NFTs realised during redemption.",
  },
  ProtocolRevenue: {
    "Property Sale Fees to Protocol": "2% of the sale price of the property NFT.",
    "Property Interest to Protocol": "Net interest earned on property NFTs realised during redemption.",
  },
  SupplySideRevenue: {
    "Property Interest to NFT Owners": "Net interest earned on property NFTs realised during redemption.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.BASE],
  start: "2026-05-08",
}

export default adapter;