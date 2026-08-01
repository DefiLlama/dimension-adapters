
import type { FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

type TChainAddress = {
  [chain: string]: string;
}
const contract_address: TChainAddress = {
  [CHAIN.ARBITRUM]: "0x3e0199792ce69dc29a0a36146bfa68bd7c8d6633",
  [CHAIN.BSC]: "0x855e99f768fad76dd0d3eb7c446c0b759c96d520",
  [CHAIN.AVAX]: "0x0ba2e492e8427fad51692ee8958ebf936bee1d84",
  [CHAIN.OPTIMISM]: "0xc6bd76fa1e9e789345e003b361e4a0037dfb7260",
  [CHAIN.FANTOM]: "0x2e81f443a11a943196c88afcb5a0d807721a88e6",
}


const fetch = async ({ createBalances, getLogs, chain, }: FetchOptions) => {
  const dailyVolume = createBalances();
  const logs_openposition = await getLogs({ target: contract_address[chain], topics: ["0xdb27855d3e94a6c985e1e59c77870a73484ef3c40d29fbfe14bb3e686da86efb"], });
  const logs_closeposition = await getLogs({ target: contract_address[chain], topics: ["0x645156066afee3ede009256908a9e96538cc1ad681c46b10114f6ce98ebd0600"] });
  const logs_liqposition = await getLogs({ target: contract_address[chain], topics: ["0xd63e21d9ddaf46f8d28d121f06e7ed33fcc0300af1f8c794e69056dbf37e2d6a"] });
  const hash = new Set()
  logs_openposition.forEach((log) => {
    if (hash.has(log.transactionHash)) return;
    const data = log.data.replace('0x', '');
    const amount = Number('0x' + data.slice(3 * 64, 4 * 64)) / 1e18;
    const assetPrice = Number('0x' + data.slice(4 * 64, 5 * 64)) / 1e18;
    dailyVolume.addCGToken('tether', amount * assetPrice);
    hash.add(log.transactionHash);
  });
  logs_closeposition.forEach((log) => {
    if (hash.has(log.transactionHash)) return;
    const data = log.data.replace('0x', '');
    const amount = Number('0x' + data.slice(4 * 64, 5 * 64)) / 1e18;
    const assetPrice = Number('0x' + data.slice(5 * 64, 6 * 64)) / 1e18;
    dailyVolume.addCGToken('tether', amount * assetPrice);
    hash.add(log.transactionHash);
  });
  logs_liqposition.forEach((log) => {
    if (hash.has(log.transactionHash)) return;
    const data = log.data.replace('0x', '');
    const amount = Number('0x' + data.slice(4 * 64, 5 * 64)) / 1e18;
    const assetPrice = Number('0x' + data.slice(5 * 64, 6 * 64)) / 1e18;
    dailyVolume.addCGToken('tether', amount * assetPrice);
  });


  return {
    dailyVolume,
  };
};


export default {
  fetch,
  version: 2,
  pullHourly: false, // it aggregates it for some reason
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2023-04-02', },
    [CHAIN.BSC]: { start: '2022-09-18', },
    [CHAIN.AVAX]: { start: '2023-02-05', },
    [CHAIN.OPTIMISM]: { start: '2023-03-07', },
  }
}