import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const MARKET_CONTRACTS = [
  "0x2A46B2FB8ed3825e4c96832b98C2F5b32Fca6902",
  "0x820EA619e4d6B209103C91463d0852Eb5834660c",
  "0x2f4915113572A85654acEBE66FE64A80A76B91b8",
  "0xA24B2B81d266700a5bD13766Fa2b410c6ebE86d5",
  "0x47820BE6aee1f0c435D7130DEb84d57c5e890c0d",
  "0xcD74363F87CD88E175e3015a9809ec944Bb0AD75",
];

const PATH_USD = "0x20c0000000000000000000000000000000000000";
const FEE_PERCENT = 0.01; // 1%

const NFT_SOLD_EVENT = "event NFTSold(address indexed nft, uint256 indexed tokenId, address buyer, uint256 price)";

async function fetch({ getLogs, createBalances }: FetchOptions) {
  const dailyVolume = createBalances();

  for (const market of MARKET_CONTRACTS) {
    const logs = await getLogs({ target: market, eventAbi: NFT_SOLD_EVENT });
    dailyVolume.add(PATH_USD, logs.map(i => i.price));
  }

  return {
    dailyVolume,
    dailyFees: dailyVolume.clone(FEE_PERCENT),
    dailyRevenue: dailyVolume.clone(FEE_PERCENT),
    dailyProtocolRevenue: dailyVolume.clone(FEE_PERCENT),
  };
}

export default {
  fetch,
  version: 2,
  pullHourly: true,
  start: "2026-03-18",
  chains: [CHAIN.TEMPO],
  methodology: {
    Volume: "Total value of all NFTs traded on FarmCats Market in pathUSD.",
    Fees: "5% marketplace commission charged on each sale.",
    Revenue: "All marketplace commissions go to the protocol feeReceiver.",
  },
};