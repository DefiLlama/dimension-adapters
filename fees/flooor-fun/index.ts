import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// auction contracts: legacy, current main, and one per NFT collection (all share the same auction bytecode)
const floorContracts: Record<string, string[]> = {
  [CHAIN.BASE]: [
    '0xF6B2C2411a101Db46c8513dDAef10b11184c58fF', // legacy
    '0xD53292182A342953f446CD4D10Dc177776044306', // current
    '0xD3706917c71b1A81CeCc31311C6B41eac344DDb5', // loopers
    '0x0c2d41b6896a7dde2641a0fe04165df180c43242', // warplets
    '0x0DA60a9965e1059F2258d5e74c3839844FEF1Cf9', // gnars
    '0x89350393e99f1df89D09376a02a99BAE9aBc8d8F', // based nouns
    '0x0669583e7d5bE64967153dd276987415926b5e32', // based onchain dinos
    '0x7b4A2c265dECE5A48e9c9232de1bd4940dfb6A0F', // base day one
    '0xE0AB0cE2FF407f53b9384205258C037c22cB03A0', // ok computers
  ],
  [CHAIN.ROBINHOOD]: [
    '0x352E6e9EF7BA1BC4398C2c3784dFdF1930D0df32', // hashcats
    '0x04ec8eDB287D20f29B834b47a44713d814b0788a', // stonkbrokers
    '0xa14b6A3980C178D8f446F6a33Bad83a9aAa2D09D', // rh machines
    '0xc347759352F8f2e556CE6A0Ea8048Fb48cfFca45', // quotrons
  ],
}
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
    targets: floorContracts[options.chain],
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
  adapter: {
    [CHAIN.BASE]: { start: '2025-10-09' },
    [CHAIN.ROBINHOOD]: { start: '2026-09-01' },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;
