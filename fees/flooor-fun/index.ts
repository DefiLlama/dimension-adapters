import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const floorContract = '0xF6B2C2411a101Db46c8513dDAef10b11184c58fF';
const eventAbi = 'event SaleSettled(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 amount)';

//https://vrnouns.gitbook.io/flooor/documentation/documentation-en/getting-started/fee-calculations
const FEE_MULTIPLIER = 500;
const BPS = 10000;
const PROTOCOL_FEE_SHARE = 50;
const NFT_HOLDERS_FEE_SHARE = 450;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    eventAbi,
    target: floorContract,
  })

  logs.forEach(l => {
    dailyVolume.addGasToken(l.amount);
    dailyFees.addGasToken(l.amount * BigInt(FEE_MULTIPLIER) / BigInt(BPS), "NFT Sale Fees");
    dailyProtocolRevenue.addGasToken(l.amount * BigInt(PROTOCOL_FEE_SHARE) / BigInt(BPS), "NFT Sale Fees to Protocol");
    dailySupplySideRevenue.addGasToken(l.amount * BigInt(NFT_HOLDERS_FEE_SHARE) / BigInt(BPS), "NFT Sale Fees to NFT Holders");
  })

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }

}

const methodology = {
  Volume: 'Counts the total volume of NFTs sold on the platform.',
  Fees: 'Counts the total fees charged on NFT sales (5% of the winning bid).',
  Revenue: '0.5% of the winning bid goes to the protocol.',
  ProtocolRevenue: '0.5% of the winning bid goes to the protocol.',
  SupplySideRevenue: '4.5% of the winning bid goes to the NFT holders.',
}

const breakdownMethodology = {
  Fees: {
    'NFT Sale Fees': 'Counts the total fees charged on NFT sales (5% of the winning bid).',
  },
  Revenue: {
    'NFT Sale Fees to Protocol': '0.5% of the winning bid goes to the protocol.',
  },
  ProtocolRevenue: {
    'NFT Sale Fees to Protocol': '0.5% of the winning bid goes to the protocol.',
  },
  SupplySideRevenue: {
    'NFT Sale Fees to NFT Holders': '4.5% of the winning bid goes to the NFT holders.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2025-10-09',
  methodology,
  breakdownMethodology,
}

export default adapter;
