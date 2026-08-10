import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json";

const l3Token = '0x46777C76dBbE40fABB2AAB99E33CE20058e76C59'
const cubes = '0x1195Cf65f83B3A5768F3C496D3A05AD6412c64B7'

const feePayout = 'event FeePayout(address indexed recipient, uint256 amount, bool isNative, uint8 recipientType)'
const cubeClaim = 'event CubeClaim (uint256 indexed questId, uint256 indexed tokenId, address indexed claimer, bool isNative, uint256 price, uint256 issueNumber, string walletProvider, string embedOrigin)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [payouts, claims] = await Promise.all([
        options.getLogs({ eventAbi: feePayout, target: cubes}),
        options.getLogs({ eventAbi: cubeClaim, target: cubes})
    ])
  claims.forEach(log => {
      const token = log.isNative ?  coreAssets.GAS_TOKEN_2 : l3Token
      dailyFees.add(token, log.price, "Cube Minting Fees")
      dailyRevenue.add(token, log.price, "Cube Minting Fees to Treasury")
  })
  payouts.forEach(log => {
    const token = log.isNative ?  coreAssets.GAS_TOKEN_2 : l3Token
    if (log.recipientType !== 0) {
        dailySupplySideRevenue.add(token, log.amount, "Cube Minting Fees to Creators and Referrals")
        dailyRevenue.subtractToken(token, log.amount, "Cube Minting Fees to Treasury")
    }
  })  

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]:     { start: '2024-01-09' },
    [CHAIN.ARBITRUM]: { start: '2024-02-05' },
    [CHAIN.POLYGON]:  { start: '2024-02-08' },
    [CHAIN.BSC]:      { start: '2024-02-08' },
    [CHAIN.OPTIMISM]: { start: '2024-02-08' },
    [CHAIN.LINEA]:    { start: '2024-02-10' },
    [CHAIN.ZORA]:     { start: '2024-02-14' },
    [CHAIN.CELO]:     { start: '2024-02-15' },
    [CHAIN.MODE]:     { start: '2024-02-15' },
    [CHAIN.SCROLL]:   { start: '2024-02-16' },
    [CHAIN.METIS]:    { start: '2024-02-28' },
    [CHAIN.BLAST]:    { start: '2024-03-01' },
    [CHAIN.XDAI]:     { start: '2024-03-26' },
    [CHAIN.INK]:      { start: '2025-01-15' },
    [CHAIN.ETHEREUM]: { start: '2025-05-22' },
    [CHAIN.MONAD]:    { start: '2026-02-11' },
  },
  methodology: {
    Fees: "Fees paid by users when minting Cube NFTs on Layer3",
    Revenue: "The portion of the fees retained by the protocol",
    ProtocolRevenue: "The portion of the fees retained by the protocol",
    SupplySideRevenue: "The portion of the fees paid to creators and referrals",
  },
  breakdownMethodology: {
    Fees: {
      "Cube Minting Fees": 'Total fees paid by users when minting Cube NFTs.',
    },
    Revenue: {
      "Cube Minting Fees to Treasury": 'Portion of the Cube minting fee retained by the Layer3 treasury.',
    },
    ProtocolRevenue: {
      "Cube Minting Fees to Treasury": 'Portion of the Cube minting fee retained by the Layer3 treasury.',
    },
    SupplySideRevenue: {
      "Cube Minting Fees to Creators and Referrals": 'Portion of the Cube minting fee paid out to creators, publishers, and referrers.',
    },
  },
};

export default adapters;
