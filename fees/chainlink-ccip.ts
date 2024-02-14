import ADDRESSES from '../helpers/coreAssets.json'
import { Chain } from "@defillama/sdk/build/general";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";


const topic_0 = '0xaffc45517195d6499808c643bd4a7b0ffeedf95bea5852840d7bfcf63f59e821';
type IContractAddress = {
  [k: string]: string[];
}
interface ILog {
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
  address: string;
  data: string;
  topics: string[];
}

const contract_address: IContractAddress = {
  [CHAIN.ETHEREUM]: [
    '0xd0b5fc9790a6085b048b8aa1ed26ca2b3b282cf2',
    '0x0f27c8532457b66d6037141deb0ed479dad04b3c',
    '0xcc19bc4d43d17eb6859f0d22ba300967c97780b0',
    '0x181314cec446cd372e555a26fc3bff3c714cd838',
    '0x70349b74888b1364ee4862d9ef8cb1af7ab47464',
    '0x1c0c7858c7ad7a6b3f4aa813ee81e56d7405c712',
    '0x5b0c089abf23b9f078a59c683abf015773f25f66',
    '0xe94b16e0fa1f6ff0a28e1dece4946ffb5748c595',
    '0xf1e3d79b19b1c810812cc0ce991e6421511f2824',
    '0xdf1d7fd22ac3ab5171e275796f123224039f3b24',
    '0x333f976915195ba9044fd0cd603cece936f6264e',
    '0xe2eb229e88f56691e96bb98256707bc62160fe73',
    '0xe5c9121cc3f796a8446b9d35b0d53b67eb4c1ab2',
  ],
  [CHAIN.ARBITRUM]: [
    '0x98dd9e9b8ae458225119ab5b8c947a9d1cd0b648',
    '0x6264f5c5bc1c0201159a5bcd6486d9c6c2f75439',
    '0x590791aa846ec4d2aa2b8697edeb6158f6054839',
    '0x9409b222c96ae8377db6a4b6645350f7dc94e9ef',
  ],
  [CHAIN.OPTIMISM]: [
    '0xad1b1f2a6dd55627e3893b771a00cd43f69dce35',
    '0xd9fb89196c902d46c07ca91e492d3e0c77a5bf93',
    '0xf06a2e32477363bcacae5b86479e176ca83d3f9d',
    '0xb188bd6cc347299eebb3ae93f57d90f580536b3a',
    '0xc40f7c8763e35fb64ab968dc812c2d24c6f8404c',
    '0x872f782a861519b3fdfb1060649f4c8343d806fe',
  ],
  [CHAIN.BSC]: [
    '0x1f17d464652f5bd74a03446fea20590ccfb3332d',
    '0xcad54be1a4bc5e467cd5b53896eb692d9f6956cd',
    '0xfdc26aa261655580f7ac413927983f664291fd22',
    '0xf7c9b607cf09b4048f09c84236ce7f11df6d6364',
  ],
  [CHAIN.BASE]: [
    '0xd44371bfde87f2db3ea6df242091351a06c2e181',
    '0xe96563b8a6b4ea245e7fcefaba813104fc889c6c',
    '0x064f0960ab66f44a5e6c7d2335b19de4bb75aa0d',
    '0x223953db4e0a4c33bac1b17b0df1c22919984c60',
  ],
  [CHAIN.POLYGON]: [
    '0x84347c236f4d4fb27673929899e554ab1151aa73',
    '0xae0e486fa6577188d586a8e4c12360fb82e2a386',
    '0x21f786fd1f6734b86ecaaf25fda67c0e6a730d41',
    '0x47d945f7bbb814b65775a89c71f5d2229be96ce9',
    '0xffaacdd8fb3af6ada58ababaec549587c81351bf',
    '0xd8e79def51a98b71c98b4c19d4a314341670ac36',
    '0xb0fdecbfcdb211b5db4fcc44a27d2d7d66d582d0',
  ],
  [CHAIN.AVAX]: [
    '0x3d3817270db2b89e9f68ba27297fb4672082f942',
    '0x2d306510fe83cdb33ff1658c71c181e9567f0009',
    '0xb4e2776aeab42ba24ac10cd9c73b985845597402',
    '0x82834e4d676a1d7a1e1969d0356515e973e6b460',
  ]
}


const fetchFees = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const toTimestamp = timestamp;
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toBlock = await getBlock(toTimestamp, chain, {});
    const fromBlock = await getBlock(fromTimestamp, chain, {});
    const logs: ILog[] = (await Promise.all(contract_address[chain].map((address: string) => sdk.getEventLogs({
      target: address,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: chain,
      topics: [topic_0]
    })))).flat();
    const rawData = logs.map((log: ILog) => {
      const data = log.data.replace('0x', '');
      const amount = Number('0x' + data.slice((3 * 64), (3 * 64) + 64));
      const address = data.slice((11 * 64), (11 * 64) + 64);
      const addressString = `0x${address.slice(24)}`;
      return {
        amount: amount,
        address: addressString,
      }
    });
    const linkETH = `${CHAIN.ETHEREUM}:${ADDRESSES.ethereum.LINK}`;
    const coins = [...new Set(rawData.map((e: any) => `${chain}:${e.address}`)), linkETH];
    const prices = await getPrices(coins, timestamp);
    const dailyFees = rawData.reduce((acc: number, { amount, address }: any) => {
      if (chain === CHAIN.BSC && address === '0x404460c6a5ede2d891e8297795264fde62adbb75') {
        const price = prices[linkETH].price;
        const decimals = prices[linkETH].decimals;
        const normalizedAmount = amount / (10 ** decimals);
        return acc + (normalizedAmount * price);
      }
      if (chain === CHAIN.POLYGON && address === '0xb0897686c545045afc77cf20ec7a532e3120e0f1') {
        const price = prices[linkETH].price;
        const decimals = prices[linkETH].decimals;
        const normalizedAmount = amount / (10 ** decimals);
        return acc + (normalizedAmount * price);
      }
      const price = prices[`${chain}:${address}`].price;
      const decimals = prices[`${chain}:${address}`].decimals;
      const normalizedAmount = amount / (10 ** decimals);
      return acc + (normalizedAmount * price);
    }, 0);

    return {
      timestamp,
      dailyFees: `${dailyFees}`,
      dailyRevenue: '0'
    };
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: 1688515200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: 1688515200,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM),
      start: 1688515200,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees(CHAIN.BSC),
      start: 1688515200,
    },
    [CHAIN.BASE]: {
      fetch: fetchFees(CHAIN.BASE),
      start: 1688515200,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: 1688515200,
    },
    [CHAIN.AVAX]: {
      fetch: fetchFees(CHAIN.AVAX),
      start: 1688515200,
    }
  }
}

export default adapter;
