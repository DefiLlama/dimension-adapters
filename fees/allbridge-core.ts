import { Chain } from "@defillama/sdk/build/general";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import axios from 'axios';

type TChainAddress = {
  [s: Chain | string]: string[];
}

const lpTokenAddresses: TChainAddress = {
  [CHAIN.ETHEREUM]: [
    '0xa7062bbA94c91d565Ae33B893Ab5dFAF1Fc57C4d',
    '0x7DBF07Ad92Ed4e26D5511b4F285508eBF174135D'
  ],
  [CHAIN.BSC]: [
    '0x8033d5b454Ee4758E4bD1D37a49009c1a81D8B10',
    '0xf833afA46fCD100e62365a0fDb0734b7c4537811'
  ],
  [CHAIN.POLYGON]: [
    '0x58Cc621c62b0aa9bABfae5651202A932279437DA',
    '0x0394c4f17738A10096510832beaB89a9DD090791',
    '0x4C42DfDBb8Ad654b42F66E0bD4dbdC71B52EB0A6',
  ],
  [CHAIN.ARBITRUM]: [
    '0x690e66fc0F8be8964d40e55EdE6aEBdfcB8A21Df'
  ],
  [CHAIN.AVAX]: [
    '0xe827352A0552fFC835c181ab5Bf1D7794038eC9f'
  ],
  [CHAIN.OPTIMISM]: [
    '0x3B96F88b2b9EB87964b852874D41B633e0f1f68F'
  ],
  [CHAIN.TRON]: [
    'TAC21biCBL9agjuUyzd4gZr356zRgJq61b'
  ]
}

const topic0_swap_fromUSD = '0xfc1df7b9ba72a13350b8a4e0f094e232eebded9edd179950e74a852a0f405112';
const topic0_swap_toUSD = '0xa930da1d3f27a25892307dd59cec52dd9b881661a0f20364757f83a0da2f6873';
const event_swap_fromUSD = 'event SwappedFromVUsd(address recipient,address token,uint256 vUsdAmount,uint256 amount,uint256 fee)';
const event_swap_toUSD = 'event SwappedToVUsd(address sender,address token,uint256 amount,uint256 vUsdAmount,uint256 fee)';

const contract_interface = new ethers.utils.Interface([
  event_swap_fromUSD,
  event_swap_toUSD
]);

interface IFee {
  amount: number;
  lp: string;
}
const abi_token = {
  "inputs": [],
  "name": "token",
  "outputs": [
      {
          "internalType": "contract ERC20",
          "name": "",
          "type": "address"
      }
  ],
  "stateMutability": "view",
  "type": "function"
}

const fetchFees = async (chain: Chain, timestamp: number): Promise<number> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24
  const fromBlock = await getBlock(fromTimestamp, chain, {});
  const toBlock = await getBlock(toTimestamp, chain, {});
  const logs_fromUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return sdk.api.util.getLogs({
      target: lpTokenAddress,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: chain,
      topics: [topic0_swap_fromUSD]
    })
  })))
    .map((p: any) => p)
    .map((a: any) => a.output).flat();
  const logs_toUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return sdk.api.util.getLogs({
      target: lpTokenAddress,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: chain,
      topics: [topic0_swap_toUSD]
    })
  })))
    .map((p: any) => p)
    .map((a: any) => a.output).flat();

  const lptokens = await sdk.api.abi.multiCall({
    abi: abi_token,
    calls: lpTokenAddresses[chain].map((address: string) => ({
      target: address
    })),
    chain: chain
  });
  const tokens = lptokens.output.map((res: any) => res.output);
  const prices = await getPrices(tokens.map((e: any) => `${chain}:${e}`), timestamp);
  const logs = logs_fromUSD.concat(logs_toUSD);
  return logs.map((log: any) => {
    const parsedLog = contract_interface.parseLog(log);
    const index = lpTokenAddresses[chain].indexOf(log.address);
    const tokenAdd = tokens[index];
    const price = prices[`${chain}:${tokenAdd}`].price;
    let decimals = prices[`${chain}:${tokenAdd}`].decimals;
    return Number(parsedLog.args.fee._hex) / 10 ** decimals * price;
  }).reduce((a: number, b: number) => a + b, 0);
};

const fetchFeesTron = async (chain: Chain, timestamp: number): Promise<number> => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 60 * 60 * 24
  const minBlockTimestampMs = fromTimestamp * 1000;
  const maxBlockTimestampMs = toTimestamp * 1000;

  const logs_fromUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return getTronLogs(lpTokenAddress, 'SwappedFromVUsd', minBlockTimestampMs, maxBlockTimestampMs);
  }))).flat();
  const logs_toUSD = (await Promise.all(lpTokenAddresses[chain].map(async (lpTokenAddress: string) => {
    return getTronLogs(lpTokenAddress, 'SwappedToVUsd', minBlockTimestampMs, maxBlockTimestampMs);
  }))).flat();
  const logs = logs_fromUSD.concat(logs_toUSD);

  const lptokens = await sdk.api.abi.multiCall({
    abi: abi_token,
    calls: lpTokenAddresses[chain].map((address: string) => ({
      target: address
    })),
    chain: chain
  });
  const tokens = lptokens.output.map((res: any) => res.output);
  const prices = await getPrices(tokens.map((e: any) => `${chain}:${e}`), timestamp);

  return logs.map((log: any) => {
    const index = lpTokenAddresses[chain].indexOf(log.contract_address);
    const tokenAdd = tokens[index];
    const price = prices[`${chain}:${tokenAdd}`].price;
    let decimals = prices[`${chain}:${tokenAdd}`].decimals;
    return Number(log.result.fee) / 10 ** decimals * price;
  }).reduce((a: number, b: number) => a + b, 0);
};

const tronRpc = `https://api.trongrid.io`
const getTronLogs = async (address: string, eventName: string, minBlockTimestamp: number, maxBlockTimestamp: number) => {
  const url = `${tronRpc}/v1/contracts/${address}/events?event_name=${eventName}&min_block_timestamp=${minBlockTimestamp}&max_block_timestamp=${maxBlockTimestamp}&limit=200`;
  const res = await axios.get(url, {});
  return res.data.data;
}
const data = [
  [
    1684022400,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684108800,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684195200,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0.000012224850749999999,
      },
    },
  ],
  [
    1684281600,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684368000,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684454400,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684540800,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0.000018337276125,
      },
    },
  ],
  [
    1684627200,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684713600,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684800000,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684886400,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1684972800,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1685059200,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1685145600,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0.000146698209,
      },
    },
  ],
  [
    1685232000,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0,
      },
    },
  ],
  [
    1685318400,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0.021658636999999998,
      },
    },
  ],
  [
    1685404800,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0.0011499839000000001,
      },
    },
  ],
  [
    1685491200,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 2.324967,
      },
    },
  ],
  [
    1685577600,
    {
      ethereum: {
        allbridge: 0.793737602882,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 3.63292417292,
      },
    },
  ],
  [
    1685664000,
    {
      ethereum: {
        allbridge: 11.705930105688001,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 3.909982996192,
      },
    },
  ],
  [
    1685750400,
    {
      ethereum: {
        allbridge: 1.499895,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 7.762936703096001,
      },
    },
  ],
  [
    1685836800,
    {
      ethereum: {
        allbridge: 21.937243914,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 11.61589041,
      },
    },
  ],
  [
    1685923200,
    {
      ethereum: {
        allbridge: 5.398261312548001,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 13.724825722848,
      },
    },
  ],
  [
    1686009600,
    {
      ethereum: {
        allbridge: 8.012763,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 10.926402861424,
      },
    },
  ],
  [
    1686096000,
    {
      ethereum: {
        allbridge: 0,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 8.12798,
      },
    },
  ],
  [
    1686182400,
    {
      ethereum: {
        allbridge: 34.815027350064,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 17.332216602336,
      },
    },
  ],
  [
    1686268800,
    {
      ethereum: {
        allbridge: 43.777334617361994,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 12.250183224220999,
      },
    },
  ],
  [
    1686355200,
    {
      ethereum: {
        allbridge: 196.46547552654,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 6.749571261444001,
      },
    },
  ],
  [
    1686441600,
    {
      ethereum: {
        allbridge: 24.714084142084,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 4.924656828178999,
      },
    },
  ],
  [
    1686528000,
    {
      ethereum: {
        allbridge: 110.60939889999999,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 0.8685006329999998,
      },
    },
  ],
  [
    1686614400,
    {
      ethereum: {
        allbridge: 77.09371,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 10.267644000000002,
      },
    },
  ],
  [
    1686700800,
    {
      ethereum: {
        allbridge: 5.862397659195,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 1.9662833162160003,
      },
    },
  ],
  [
    1686787200,
    {
      ethereum: {
        allbridge: 189.337336926276,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 16.475619247416,
      },
    },
  ],
  [
    1686873600,
    {
      ethereum: {
        allbridge: 183.802941722354,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 26.929694417706003,
      },
    },
  ],
  [
    1686960000,
    {
      ethereum: {
        allbridge: 68.92440556404601,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 3.909576320464,
      },
    },
  ],
  [
    1687046400,
    {
      ethereum: {
        allbridge: 86.300417,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 20.302814,
      },
    },
  ],
  [
    1687132800,
    {
      ethereum: {
        allbridge: 5.104579,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 109.89914800000001,
      },
    },
  ],
  [
    1687219200,
    {
      ethereum: {
        allbridge: 64.195153022,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 284.2104515250002,
      },
    },
  ],
  [
    1687305600,
    {
      ethereum: {
        allbridge: 109.449472,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 318.37939500000033,
      },
    },
  ],
  [
    1687392000,
    {
      ethereum: {
        allbridge: 22.931840952557998,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 86.672731343526,
      },
    },
  ],
  [
    1687478400,
    {
      ethereum: {
        allbridge: 34.033389,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 10.191647000000003,
      },
    },
  ],
  [
    1687564800,
    {
      ethereum: {
        allbridge: 20.267763320036,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 17.5424165384,
      },
    },
  ],
  [
    1687651200,
    {
      ethereum: {
        allbridge: 38.718278960304,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 58.496663985,
      },
    },
  ],
  [
    1687737600,
    {
      ethereum: {
        allbridge: 13.278534268999998,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 4.676819147000001,
      },
    },
  ],
  [
    1687824000,
    {
      ethereum: {
        allbridge: 36.72813333481601,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 15.991358161968003,
      },
    },
  ],
  [
    1687910400,
    {
      ethereum: {
        allbridge: 26.810861231214,
      },
      arbitrum: {
        allbridge: 0.013468338341999998,
      },
      polygon: {
        allbridge: 7.42131633579,
      },
    },
  ],
  [
    1687996800,
    {
      ethereum: {
        allbridge: 46.440611044344,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 50.220431862282005,
      },
    },
  ],
  [
    1688083200,
    {
      ethereum: {
        allbridge: 26.105049971,
      },
      arbitrum: {
        allbridge: 0.0030029999999999996,
      },
      polygon: {
        allbridge: 21.258478241,
      },
    },
  ],
  [
    1688169600,
    {
      ethereum: {
        allbridge: 39.743982,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 36.136921,
      },
    },
  ],
  [
    1688256000,
    {
      ethereum: {
        allbridge: 20.850325495999996,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 9.225270054,
      },
    },
  ],
  [
    1688342400,
    {
      ethereum: {
        allbridge: 5.072148246858,
      },
      arbitrum: {
        allbridge: 0.37678419824100007,
      },
      polygon: {
        allbridge: 4.378354158624002,
      },
    },
  ],
  [
    1688428800,
    {
      ethereum: {
        allbridge: 0.32612534719200004,
      },
      arbitrum: {
        allbridge: 1.5271228967939998,
      },
      polygon: {
        allbridge: 9.939452945957997,
      },
    },
  ],
  [
    1688515200,
    {
      ethereum: {
        allbridge: 168.595374,
      },
      arbitrum: {
        allbridge: 26.318457,
      },
      polygon: {
        allbridge: 23.796384,
      },
    },
  ],
  [
    1688601600,
    {
      ethereum: {
        allbridge: 107.824599,
      },
      arbitrum: {
        allbridge: 4.668379000000001,
      },
      polygon: {
        allbridge: 9.664389,
      },
    },
  ],
  [
    1688688000,
    {
      ethereum: {
        allbridge: 12.019272350923002,
      },
      arbitrum: {
        allbridge: 3.096222821275,
      },
      polygon: {
        allbridge: 13.375831582991003,
      },
    },
  ],
  [
    1688774400,
    {
      ethereum: {
        allbridge: 20.977921964999997,
      },
      arbitrum: {
        allbridge: 1.8299250969999998,
      },
      polygon: {
        allbridge: 3.9918999119999996,
      },
    },
  ],
  [
    1688860800,
    {
      ethereum: {
        allbridge: 89.191193673708,
      },
      arbitrum: {
        allbridge: 3.7827852620040003,
      },
      polygon: {
        allbridge: 7.4114832309839995,
      },
    },
  ],
  [
    1688947200,
    {
      ethereum: {
        allbridge: 30.713386446876,
      },
      arbitrum: {
        allbridge: 21.261277511817998,
      },
      polygon: {
        allbridge: 5.748865615492,
      },
    },
  ],
  [
    1689033600,
    {
      ethereum: {
        allbridge: 74.885359,
      },
      arbitrum: {
        allbridge: 0.499747,
      },
      polygon: {
        allbridge: 4.086248,
      },
    },
  ],
  [
    1689120000,
    {
      ethereum: {
        allbridge: 60.80759900000001,
      },
      arbitrum: {
        allbridge: 12.038677,
      },
      polygon: {
        allbridge: 9.964722,
      },
    },
  ],
  [
    1689206400,
    {
      ethereum: {
        allbridge: 25.041956254358,
      },
      arbitrum: {
        allbridge: 56.210347525893994,
      },
      polygon: {
        allbridge: 15.394593008024003,
      },
    },
  ],
  [
    1689292800,
    {
      ethereum: {
        allbridge: 36.554455938000004,
      },
      arbitrum: {
        allbridge: 143.92604926699988,
      },
      polygon: {
        allbridge: 148.41666239399993,
      },
    },
  ],
  [
    1689379200,
    {
      ethereum: {
        allbridge: 26.13653,
      },
      arbitrum: {
        allbridge: 160.06310899999997,
      },
      polygon: {
        allbridge: 205.096277,
      },
    },
  ],
  [
    1689465600,
    {
      ethereum: {
        allbridge: 201.145381264401,
      },
      arbitrum: {
        allbridge: 67.14309686222096,
      },
      polygon: {
        allbridge: 84.28287356991301,
      },
    },
  ],
  [
    1689552000,
    {
      ethereum: {
        allbridge: 43.006668705,
      },
      arbitrum: {
        allbridge: 58.038528548,
      },
      polygon: {
        allbridge: 85.05102005399999,
      },
    },
  ],
  [
    1689638400,
    {
      ethereum: {
        allbridge: 9.908885986999998,
      },
      arbitrum: {
        allbridge: 40.629640050999996,
      },
      polygon: {
        allbridge: 56.09701497400001,
      },
    },
  ],
  [
    1689724800,
    {
      ethereum: {
        allbridge: 82.08985200000001,
      },
      arbitrum: {
        allbridge: 34.885938,
      },
      polygon: {
        allbridge: 42.948814,
      },
    },
  ],
  [
    1689811200,
    {
      ethereum: {
        allbridge: 99.89982700306001,
      },
      arbitrum: {
        allbridge: 28.16485929158999,
      },
      polygon: {
        allbridge: 45.25304306866,
      },
    },
  ],
  [
    1689897600,
    {
      ethereum: {
        allbridge: 238.44027663732598,
      },
      arbitrum: {
        allbridge: 52.229535804071006,
      },
      polygon: {
        allbridge: 34.456926039685015,
      },
    },
  ],
  [
    1689984000,
    {
      ethereum: {
        allbridge: 17.878708855504,
      },
      arbitrum: {
        allbridge: 29.519316303057003,
      },
      polygon: {
        allbridge: 44.307350493022014,
      },
    },
  ],
  [
    1690070400,
    {
      ethereum: {
        allbridge: 41.077145859280996,
      },
      arbitrum: {
        allbridge: 21.242475273165997,
      },
      polygon: {
        allbridge: 54.157774946359005,
      },
    },
  ],
  [
    1690156800,
    {
      ethereum: {
        allbridge: 50.643935,
      },
      arbitrum: {
        allbridge: 15.873609,
      },
      polygon: {
        allbridge: 21.708845000000004,
      },
    },
  ],
  [
    1690243200,
    {
      ethereum: {
        allbridge: 16.708511322,
      },
      arbitrum: {
        allbridge: 18.419005481999996,
      },
      polygon: {
        allbridge: 51.99811200000002,
      },
    },
  ],
  [
    1690329600,
    {
      ethereum: {
        allbridge: 206.832869,
      },
      arbitrum: {
        allbridge: 83.10240600000002,
      },
      polygon: {
        allbridge: 82.28737900000003,
      },
    },
  ],
  [
    1690416000,
    {
      ethereum: {
        allbridge: 41.310742380318004,
      },
      arbitrum: {
        allbridge: 29.158073373843003,
      },
      polygon: {
        allbridge: 75.71935891125001,
      },
    },
  ],
  [
    1690502400,
    {
      ethereum: {
        allbridge: 60.21973952973301,
      },
      arbitrum: {
        allbridge: 59.09902615246199,
      },
      polygon: {
        allbridge: 32.94349135516198,
      },
    },
  ],
  [
    1690588800,
    {
      ethereum: {
        allbridge: 503.10224660724816,
      },
      arbitrum: {
        allbridge: 68.28548975880803,
      },
      polygon: {
        allbridge: 58.381135070704005,
      },
    },
  ],
  [
    1690675200,
    {
      ethereum: {
        allbridge: 2475.2873516025807,
      },
      arbitrum: {
        allbridge: 104.364061303183,
      },
      polygon: {
        allbridge: 100.79447257151794,
      },
    },
  ],
  [
    1690761600,
    {
      ethereum: {
        allbridge: 151.38033039581995,
      },
      arbitrum: {
        allbridge: 39.79403592749399,
      },
      polygon: {
        allbridge: 48.79092656764201,
      },
    },
  ],
  [
    1690848000,
    {
      ethereum: {
        allbridge: 36.59238882,
      },
      arbitrum: {
        allbridge: 34.96948467,
      },
      polygon: {
        allbridge: 81.95353924200005,
      },
    },
  ],
  [
    1690934400,
    {
      ethereum: {
        allbridge: 10.899458094838,
      },
      arbitrum: {
        allbridge: 16.621485806066,
      },
      polygon: {
        allbridge: 40.57284534070801,
      },
    },
  ],
  [
    1691020800,
    {
      ethereum: {
        allbridge: 114.29043929388999,
      },
      arbitrum: {
        allbridge: 21.043988157933995,
      },
      polygon: {
        allbridge: 41.03637302062401,
      },
    },
  ],
  [
    1691107200,
    {
      ethereum: {
        allbridge: 17.609826000000005,
      },
      arbitrum: {
        allbridge: 14.547167,
      },
      polygon: {
        allbridge: 12.851228000000004,
      },
    },
  ],
  [
    1691193600,
    {
      ethereum: {
        allbridge: 10.89221393511,
      },
      arbitrum: {
        allbridge: 43.237600978859994,
      },
      polygon: {
        allbridge: 10.241032890816,
      },
    },
  ],
  [
    1691280000,
    {
      ethereum: {
        allbridge: 12.738947428498001,
      },
      arbitrum: {
        allbridge: 15.572184619132,
      },
      polygon: {
        allbridge: 19.068741247606003,
      },
    },
  ],
  [
    1691366400,
    {
      ethereum: {
        allbridge: 103.77093899999998,
      },
      arbitrum: {
        allbridge: 8.704214000000002,
      },
      polygon: {
        allbridge: 24.47241500000001,
      },
    },
  ],
  [
    1691452800,
    {
      ethereum: {
        allbridge: 63.13408185463801,
      },
      arbitrum: {
        allbridge: 98.167077249339,
      },
      polygon: {
        allbridge: 22.459557714486998,
      },
    },
  ],
  [
    1691539200,
    {
      ethereum: {
        allbridge: 35.4599818226,
      },
      arbitrum: {
        allbridge: 12.980109488000002,
      },
      polygon: {
        allbridge: 21.568923914325,
      },
    },
  ],
  [
    1691625600,
    {
      ethereum: {
        allbridge: 32.852985000000004,
      },
      arbitrum: {
        allbridge: 49.048216,
      },
      polygon: {
        allbridge: 25.604946000000005,
      },
    },
  ],
  [
    1691712000,
    {
      ethereum: {
        allbridge: 32.050008,
      },
      arbitrum: {
        allbridge: 78.69282600000003,
      },
      polygon: {
        allbridge: 56.073347999999974,
      },
    },
  ],
  [
    1691798400,
    {
      ethereum: {
        allbridge: 64.82932589158801,
      },
      arbitrum: {
        allbridge: 11.537906473215001,
      },
      polygon: {
        allbridge: 44.55162171026699,
      },
    },
  ],
  [
    1691884800,
    {
      ethereum: {
        allbridge: 13.558426705026003,
      },
      arbitrum: {
        allbridge: 17.955383158874998,
      },
      polygon: {
        allbridge: 26.771592903569996,
      },
    },
  ],
  [
    1691971200,
    {
      ethereum: {
        allbridge: 37.043237999999995,
      },
      arbitrum: {
        allbridge: 44.72756199999999,
      },
      polygon: {
        allbridge: 20.354741,
      },
    },
  ],
  [
    1692057600,
    {
      ethereum: {
        allbridge: 23.006739653643052,
      },
      arbitrum: {
        allbridge: 11.38675633689852,
      },
      polygon: {
        allbridge: 14.458851907595475,
      },
    },
  ],
  [
    1692144000,
    {
      ethereum: {
        allbridge: 196.51717013341033,
      },
      arbitrum: {
        allbridge: 36.559034793636584,
      },
      polygon: {
        allbridge: 50.11506149304171,
      },
    },
  ],
  [
    1692230400,
    {
      ethereum: {
        allbridge: 40.07762759,
      },
      arbitrum: {
        allbridge: 73.41612077799998,
      },
      polygon: {
        allbridge: 464.3259851229999,
      },
    },
  ],
  [
    1692316800,
    {
      ethereum: {
        allbridge: 27.582485,
      },
      arbitrum: {
        allbridge: 23.249612999999993,
      },
      polygon: {
        allbridge: 546.851354,
      },
    },
  ],
  [
    1692403200,
    {
      ethereum: {
        allbridge: 87.94008514580001,
      },
      arbitrum: {
        allbridge: 18.74039802425,
      },
      polygon: {
        allbridge: 22.944548304900007,
      },
    },
  ],
  [
    1692489600,
    {
      ethereum: {
        allbridge: 153.52354100000002,
      },
      arbitrum: {
        allbridge: 17.283103999999998,
      },
      polygon: {
        allbridge: 21.423098522613024,
      },
    },
  ],
  [
    1692576000,
    {
      ethereum: {
        allbridge: 225.3593958324896,
      },
      arbitrum: {
        allbridge: 58.61603520336316,
      },
      polygon: {
        allbridge: 19.90164874032604,
      },
    },
  ],
  [
    1692662400,
    {
      ethereum: {
        allbridge: 183.21494481526597,
      },
      arbitrum: {
        allbridge: 26.906479504309992,
      },
      polygon: {
        allbridge: 17.096752044413996,
      },
    },
  ],
  [
    1692748800,
    {
      ethereum: {
        allbridge: 307.30252944121816,
      },
      arbitrum: {
        allbridge: 17.43276443377457,
      },
      polygon: {
        allbridge: 133.871301321627,
      },
    },
  ],
  [
    1692835200,
    {
      ethereum: {
        allbridge: 56.767875694464486,
      },
      arbitrum: {
        allbridge: 18.914628556923002,
      },
      polygon: {
        allbridge: 62.89515656559328,
      },
    },
  ],
  [
    1692921600,
    {
      ethereum: {
        allbridge: 69.38490237398082,
      },
      arbitrum: {
        allbridge: 23.942413303314634,
      },
      polygon: {
        allbridge: 10.276214658517329,
      },
    },
  ],
  [
    1693008000,
    {
      ethereum: {
        allbridge: 4.939914212199181,
      },
      arbitrum: {
        allbridge: 18.204977944909157,
      },
      polygon: {
        allbridge: 16.582888963933694,
      },
    },
  ],
  [
    1693094400,
    {
      ethereum: {
        allbridge: 88.19088517816549,
      },
      arbitrum: {
        allbridge: 11.291603008332343,
      },
      polygon: {
        allbridge: 32.34422248071649,
      },
    },
  ],
  [
    1693180800,
    {
      ethereum: {
        allbridge: 31.266344,
      },
      arbitrum: {
        allbridge: 35.360527999999995,
      },
      polygon: {
        allbridge: 38.53041300000002,
      },
    },
  ],
  [
    1693267200,
    {
      ethereum: {
        allbridge: 212.05029403594327,
      },
      arbitrum: {
        allbridge: 8.986056316901374,
      },
      polygon: {
        allbridge: 37.01825725734806,
      },
    },
  ],
  [
    1693353600,
    {
      ethereum: {
        allbridge: 47.28223623689896,
      },
      arbitrum: {
        allbridge: 11.735690589377873,
      },
      polygon: {
        allbridge: 25.37027718289432,
      },
    },
  ],
  [
    1693440000,
    {
      ethereum: {
        allbridge: 13.363734728292,
      },
      arbitrum: {
        allbridge: 11.571633792926999,
      },
      polygon: {
        allbridge: 15.373859898059,
      },
    },
  ],
  [
    1693526400,
    {
      ethereum: {
        allbridge: 179.09682324191786,
      },
      arbitrum: {
        allbridge: 5.602409464081542,
      },
      polygon: {
        allbridge: 12.95807792044794,
      },
    },
  ],
  [
    1693612800,
    {
      ethereum: {
        allbridge: 20.352369595178192,
      },
      arbitrum: {
        allbridge: 8.075574541853323,
      },
      polygon: {
        allbridge: 63.39022035038444,
      },
    },
  ],
  [
    1693699200,
    {
      ethereum: {
        allbridge: 25.328386561958506,
      },
      arbitrum: {
        allbridge: 12.568068084276492,
      },
      polygon: {
        allbridge: 11.628025996656966,
      },
    },
  ],
  [
    1693785600,
    {
      ethereum: {
        allbridge: 43.751219455949894,
      },
      arbitrum: {
        allbridge: 22.55280859234006,
      },
      polygon: {
        allbridge: 13.553488806229678,
      },
    },
  ],
  [
    1693872000,
    {
      ethereum: {
        allbridge: 126.57914460662296,
      },
      arbitrum: {
        allbridge: 17.697256419544996,
      },
      polygon: {
        allbridge: 17.464805723057996,
      },
    },
  ],
  [
    1693958400,
    {
      ethereum: {
        allbridge: 106.10705991879,
      },
      arbitrum: {
        allbridge: 4.277561223959999,
      },
      polygon: {
        allbridge: 41.179842197460005,
      },
    },
  ],
  [
    1694044800,
    {
      ethereum: {
        allbridge: 82.685381,
      },
      arbitrum: {
        allbridge: 7.158186,
      },
      polygon: {
        allbridge: 16.136644999999994,
      },
    },
  ],
  [
    1694131200,
    {
      ethereum: {
        allbridge: 28.580939,
      },
      arbitrum: {
        allbridge: 68.51517299999998,
      },
      polygon: {
        allbridge: 16.910555000000002,
      },
    },
  ],
  [
    1694217600,
    {
      ethereum: {
        allbridge: 212.93117738802,
      },
      arbitrum: {
        allbridge: 7.1160107010299996,
      },
      polygon: {
        allbridge: 3.27899787201,
      },
    },
  ],
  [
    1694304000,
    {
      ethereum: {
        allbridge: 144.97118256384,
      },
      arbitrum: {
        allbridge: 8.59329611384,
      },
      polygon: {
        allbridge: 9.97982626672,
      },
    },
  ],
  [
    1694390400,
    {
      ethereum: {
        allbridge: 270.86538531327557,
      },
      arbitrum: {
        allbridge: 10.137018423274585,
      },
      polygon: {
        allbridge: 42.96410296589679,
      },
    },
  ],
  [
    1694476800,
    {
      ethereum: {
        allbridge: 64.84547522240057,
      },
      arbitrum: {
        allbridge: 5.841332182666729,
      },
      polygon: {
        allbridge: 35.82618057563395,
      },
    },
  ],
  [
    1694563200,
    {
      ethereum: {
        allbridge: 208.80304434199206,
      },
      arbitrum: {
        allbridge: 20.919990717039,
      },
      polygon: {
        allbridge: 30.901492136751006,
      },
    },
  ],
  [
    1694649600,
    {
      ethereum: {
        allbridge: 59.361788999999995,
      },
      arbitrum: {
        allbridge: 8.702407,
      },
      polygon: {
        allbridge: 8.680093000000001,
      },
    },
  ],
  [
    1694736000,
    {
      ethereum: {
        allbridge: 75.85325336186398,
      },
      arbitrum: {
        allbridge: 13.288818108852,
      },
    },
  ],
  [
    1694822400,
    {
      ethereum: {
        allbridge: 41.298419644930995,
      },
      arbitrum: {
        allbridge: 9.879891551708997,
      },
      polygon: {
        allbridge: 9.279283672662999,
      },
    },
  ],
  [
    1694908800,
    {
      ethereum: {
        allbridge: 18.245144917999994,
      },
      arbitrum: {
        allbridge: 8.808766967,
      },
      polygon: {
        allbridge: 11.057552506,
      },
    },
  ],
  [
    1694995200,
    {
      ethereum: {
        allbridge: 317.82913288786006,
      },
      arbitrum: {
        allbridge: 12.989763000000002,
      },
      polygon: {
        allbridge: 19.12149322168001,
      },
    },
  ],
  [
    1695081600,
    {
      ethereum: {
        allbridge: 190.898378653873,
      },
      arbitrum: {
        allbridge: 5.191185589254,
      },
      polygon: {
        allbridge: 13.895861532439998,
      },
    },
  ],
  [
    1695168000,
    {
      ethereum: {
        allbridge: 199.85505142633602,
      },
      arbitrum: {
        allbridge: 6.658111034664004,
      },
      polygon: {
        allbridge: 9.729407545715002,
      },
    },
  ],
  [
    1695254400,
    {
      ethereum: {
        allbridge: 120.918736040451,
      },
      arbitrum: {
        allbridge: 8.921455565670003,
      },
      polygon: {
        allbridge: 29.814894304182,
      },
    },
  ],
  [
    1695340800,
    {
      ethereum: {
        allbridge: 26.224356834999067,
      },
      arbitrum: {
        allbridge: 10.478842588556006,
      },
    },
  ],
  [
    1695427200,
    {
      ethereum: {
        allbridge: 51.43879381825999,
      },
      arbitrum: {
        allbridge: 11.181773468520003,
      },
      polygon: {
        allbridge: 21.996070358260006,
      },
    },
  ],
  [
    1695513600,
    {
      ethereum: {
        allbridge: 20.47993,
      },
      arbitrum: {
        allbridge: 13.739322000000005,
      },
      polygon: {
        allbridge: 9.362220999999998,
      },
    },
  ],
  [
    1695600000,
    {
      ethereum: {
        allbridge: 314.46763956849486,
      },
      arbitrum: {
        allbridge: 9.065141103284,
      },
    },
  ],
  [
    1695686400,
    {
      ethereum: {
        allbridge: 210.84894539209995,
      },
      arbitrum: {
        allbridge: 18.34854,
      },
      polygon: {
        allbridge: 26.42123270908501,
      },
    },
  ],
  [
    1695772800,
    {
      ethereum: {
        allbridge: 29.131462740283002,
      },
      arbitrum: {
        allbridge: 14.523287,
      },
      polygon: {
        allbridge: 93.08630749176899,
      },
    },
  ],
  [
    1695859200,
    {
      ethereum: {
        allbridge: 144.77680365582802,
      },
      arbitrum: {
        allbridge: 39.13114073439999,
      },
      polygon: {
        allbridge: 15.252725065028,
      },
    },
  ],
  [
    1695945600,
    {
      ethereum: {
        allbridge: 344.05815485968094,
      },
      arbitrum: {
        allbridge: 27.4766338314346,
      },
    },
  ],
  [
    1696032000,
    {
      ethereum: {
        allbridge: 68.32939102592418,
      },
      arbitrum: {
        allbridge: 16.59611027758909,
      },
      polygon: {
        allbridge: 9.543776715631267,
      },
    },
  ],
  [
    1696118400,
    {
      ethereum: {
        allbridge: 97.71480662082297,
      },
      arbitrum: {
        allbridge: 8.704798,
      },
      polygon: {
        allbridge: 11.363722556140997,
      },
    },
  ],
  [
    1696204800,
    {
      ethereum: {
        allbridge: 168.10756650595596,
      },
      arbitrum: {
        allbridge: 6.139344750677998,
      },
      polygon: {
        allbridge: 30.580884089330002,
      },
    },
  ],
  [
    1696291200,
    {
      ethereum: {
        allbridge: 264.61557490211595,
      },
      arbitrum: {
        allbridge: 17.388771394597,
      },
      polygon: {
        allbridge: 38.622121042325,
      },
    },
  ],
  [
    1696377600,
    {
      ethereum: {
        allbridge: 203.41467295461,
      },
      arbitrum: {
        allbridge: 6.643562408434002,
      },
      polygon: {
        allbridge: 44.842560605649,
      },
    },
  ],
  [
    1696464000,
    {
      ethereum: {
        allbridge: 79.126657454344,
      },
      arbitrum: {
        allbridge: 11.869333378462004,
      },
      polygon: {
        allbridge: 24.643205582397997,
      },
    },
  ],
  [
    1696550400,
    {
      ethereum: {
        allbridge: 171.0370089055474,
      },
      arbitrum: {
        allbridge: 12.089239999999998,
      },
      polygon: {
        allbridge: 23.114312395974387,
      },
    },
  ],
  [
    1696636800,
    {
      ethereum: {
        allbridge: 208.210502638342,
      },
      arbitrum: {
        allbridge: 20.902681718405997,
      },
      polygon: {
        allbridge: 92.35731563069204,
      },
    },
  ],
  [
    1696723200,
    {
      ethereum: {
        allbridge: 32.347528835489264,
      },
      arbitrum: {
        allbridge: 16.576786492369003,
      },
    },
  ],
  [
    1696809600,
    {
      ethereum: {
        allbridge: 93.61300954503497,
      },
      arbitrum: {
        allbridge: 45.96038302051699,
      },
      polygon: {
        allbridge: 36.138803676239995,
      },
    },
  ],
  [
    1696896000,
    {
      ethereum: {
        allbridge: 139.22752570192205,
      },
      bsc: {
        allbridge: 683.4801309796547,
      },
      arbitrum: {
        allbridge: 13.530385412405998,
      },
      polygon: {
        allbridge: 134.88461621917796,
      },
    },
  ],
  [
    1696982400,
    {
      ethereum: {
        allbridge: 69.870180403968,
      },
      bsc: {
        allbridge: 461.96310034733443,
      },
      arbitrum: {
        allbridge: 4.679233999999998,
      },
      polygon: {
        allbridge: 19.082680229799998,
      },
    },
  ],
  [
    1697068800,
    {
      ethereum: {
        allbridge: 233.1927542335441,
      },
      bsc: {
        allbridge: 221.46527114357332,
      },
      arbitrum: {
        allbridge: 23.614627000000002,
      },
      polygon: {
        allbridge: 109.78573869009595,
      },
    },
  ],
  [
    1697155200,
    {
      ethereum: {
        allbridge: 150.25443575134403,
      },
      bsc: {
        allbridge: 16.381310949046405,
      },
      arbitrum: {
        allbridge: 19.353361000000003,
      },
      polygon: {
        allbridge: 25.970690488360013,
      },
    },
  ],
  [
    1697241600,
    {
      ethereum: {
        allbridge: 162.95531548386427,
      },
      bsc: {
        allbridge: 32.897408927340315,
      },
      arbitrum: {
        allbridge: 4.987787940964971,
      },
      polygon: {
        allbridge: 6.598993915385862,
      },
    },
  ],
  [
    1697328000,
    {
      ethereum: {
        allbridge: 14.429037900421998,
      },
      bsc: {
        allbridge: 19.59568045548193,
      },
      arbitrum: {
        allbridge: 16.257668,
      },
      polygon: {
        allbridge: 23.82431915906,
      },
    },
  ],
  [
    1697414400,
    {
      ethereum: {
        allbridge: 340.95223667604,
      },
      bsc: {
        allbridge: 69.28114536161986,
      },
      arbitrum: {
        allbridge: 14.917903078359993,
      },
      polygon: {
        allbridge: 6.301545013929999,
      },
    },
  ],
  [
    1697500800,
    {
      ethereum: {
        allbridge: 310.51928962471203,
      },
      bsc: {
        allbridge: 52.66806193981848,
      },
      arbitrum: {
        allbridge: 13.211110699149001,
      },
      polygon: {
        allbridge: 8.402891016896,
      },
    },
  ],
  [
    1697587200,
    {
      ethereum: {
        allbridge: 101.54061889108202,
      },
      bsc: {
        allbridge: 49.34561833554675,
      },
      arbitrum: {
        allbridge: 15.549308452213998,
      },
      polygon: {
        allbridge: 10.50157992829,
      },
    },
  ],
  [
    1697673600,
    {
      ethereum: {
        allbridge: 750.0292240539999,
      },
      bsc: {
        allbridge: 160.15299053918875,
      },
      arbitrum: {
        allbridge: 14.415772000000002,
      },
      polygon: {
        allbridge: 80.413022359,
      },
    },
  ],
  [
    1697760000,
    {
      ethereum: {
        allbridge: 320.4467427339959,
      },
      bsc: {
        allbridge: 219.47425590844054,
      },
      arbitrum: {
        allbridge: 31.366753595268,
      },
      polygon: {
        allbridge: 25.075472150128,
      },
    },
  ],
  [
    1697846400,
    {
      ethereum: {
        allbridge: 99.307045,
      },
      bsc: {
        allbridge: 7.127457248813389,
      },
      arbitrum: {
        allbridge: 19.105653999999998,
      },
      polygon: {
        allbridge: 20.171359999999996,
      },
    },
  ],
  [
    1697932800,
    {
      ethereum: {
        allbridge: 79.96340552199999,
      },
      bsc: {
        allbridge: 46.89818721994016,
      },
      arbitrum: {
        allbridge: 80.76203735599998,
      },
      polygon: {
        allbridge: 13.472192734000002,
      },
    },
  ],
  [
    1698019200,
    {
      ethereum: {
        allbridge: 237.29912855576538,
      },
      bsc: {
        allbridge: 46.14884798754037,
      },
      arbitrum: {
        allbridge: 81.88851240852661,
      },
      polygon: {
        allbridge: 26.206565818097264,
      },
    },
  ],
  [
    1698105600,
    {
      ethereum: {
        allbridge: 355.11779532499986,
      },
      bsc: {
        allbridge: 88.69374689257208,
      },
      arbitrum: {
        allbridge: 80.17369159800002,
      },
      polygon: {
        allbridge: 38.368941520999975,
      },
    },
  ],
  [
    1698192000,
    {
      ethereum: {
        allbridge: 186.290027732256,
      },
      bsc: {
        allbridge: 204.95454280108677,
      },
      arbitrum: {
        allbridge: 33.91456502273601,
      },
      polygon: {
        allbridge: 11.935710663232008,
      },
    },
  ],
  [
    1698278400,
    {
      ethereum: {
        allbridge: 624.6236431963767,
      },
      bsc: {
        allbridge: 80.65198724460657,
      },
      arbitrum: {
        allbridge: 14.058744144884002,
      },
      polygon: {
        allbridge: 25.37667462193401,
      },
    },
  ],
  [
    1698364800,
    {
      ethereum: {
        allbridge: 456.0776095643899,
      },
      bsc: {
        allbridge: 59.01153191363551,
      },
      arbitrum: {
        allbridge: 36.52219499507399,
      },
      polygon: {
        allbridge: 9.898431762382002,
      },
    },
  ],
  [
    1698451200,
    {
      ethereum: {
        allbridge: 602.98532690694,
      },
      bsc: {
        allbridge: 70.22745743953882,
      },
      arbitrum: {
        allbridge: 35.93376098199998,
      },
      polygon: {
        allbridge: 24.155846978468,
      },
    },
  ],
  [
    1698537600,
    {
      ethereum: {
        allbridge: 263.21171831799995,
      },
      bsc: {
        allbridge: 28.576127711962787,
      },
      arbitrum: {
        allbridge: 14.443171686,
      },
      polygon: {
        allbridge: 7.145420694000001,
      },
    },
  ],
  [
    1698624000,
    {
      ethereum: {
        allbridge: 127.857304,
      },
      bsc: {
        allbridge: 50.708829476896625,
      },
      arbitrum: {
        allbridge: 6.627002999999999,
      },
      polygon: {
        allbridge: 18.93089399999999,
      },
    },
  ],
  [
    1698710400,
    {
      ethereum: {
        allbridge: 271.60526774429997,
      },
      bsc: {
        allbridge: 551.3955779885251,
      },
      arbitrum: {
        allbridge: 16.123922515100002,
      },
      polygon: {
        allbridge: 18.90629143904,
      },
    },
  ],
  [
    1698796800,
    {
      ethereum: {
        allbridge: 378.80605341984995,
      },
      bsc: {
        allbridge: 159.26209737157396,
      },
      arbitrum: {
        allbridge: 146.32204422672,
      },
      polygon: {
        allbridge: 80.00545524208499,
      },
    },
  ],
  [
    1698883200,
    {
      ethereum: {
        allbridge: 194.08988266203997,
      },
      bsc: {
        allbridge: 41.21369499320223,
      },
      arbitrum: {
        allbridge: 12.502634144000002,
      },
      polygon: {
        allbridge: 42.02201954100001,
      },
    },
  ],
  [
    1698969600,
    {
      ethereum: {
        allbridge: 129.181568399956,
      },
      bsc: {
        allbridge: 123.83591850447378,
      },
      arbitrum: {
        allbridge: 30.04038114752399,
      },
      polygon: {
        allbridge: 18.809010436927004,
      },
    },
  ],
  [
    1699056000,
    {
      ethereum: {
        allbridge: 245.4753788307176,
      },
      bsc: {
        allbridge: 111.04587920125891,
      },
      arbitrum: {
        allbridge: 12.00219452331421,
      },
      polygon: {
        allbridge: 34.04468785125595,
      },
    },
  ],
  [
    1699142400,
    {
      ethereum: {
        allbridge: 73.15374142107201,
      },
      bsc: {
        allbridge: 57.08623957935124,
      },
      arbitrum: {
        allbridge: 31.382522437471994,
      },
      polygon: {
        allbridge: 29.459812622807995,
      },
    },
  ],
  [
    1699228800,
    {
      ethereum: {
        allbridge: 153.58367286500004,
      },
      bsc: {
        allbridge: 72.91382615376152,
      },
      arbitrum: {
        allbridge: 15.415889999999992,
      },
      polygon: {
        allbridge: 26.656923404000008,
      },
    },
  ],
  [
    1699315200,
    {
      ethereum: {
        allbridge: 53.910506828999985,
      },
      bsc: {
        allbridge: 58.56971916721782,
      },
      arbitrum: {
        allbridge: 19.866284438,
      },
      polygon: {
        allbridge: 8.468478559999998,
      },
    },
  ],
  [
    1699401600,
    {
      ethereum: {
        allbridge: 441.8741941251799,
      },
      bsc: {
        allbridge: 194.06562481667805,
      },
      arbitrum: {
        allbridge: 48.710796605511,
      },
      polygon: {
        allbridge: 26.936022452076006,
      },
    },
  ],
  [
    1699488000,
    {
      ethereum: {
        allbridge: 123.52995330872004,
      },
      bsc: {
        allbridge: 77.33036889524023,
      },
      arbitrum: {
        allbridge: 68.064697974972,
      },
      polygon: {
        allbridge: 47.20142519972597,
      },
    },
  ],
  [
    1699574400,
    {
      ethereum: {
        allbridge: 362.70917700000007,
      },
      bsc: {
        allbridge: 86.73830154661925,
      },
      arbitrum: {
        allbridge: 63.11650499999997,
      },
      polygon: {
        allbridge: 41.13657299999998,
      },
    },
  ],
  [
    1699660800,
    {
      ethereum: {
        allbridge: 244.04446866799992,
      },
      bsc: {
        allbridge: 55.84745290772778,
      },
      arbitrum: {
        allbridge: 92.88334355299996,
      },
      polygon: {
        allbridge: 57.82608031199999,
      },
    },
  ],
  [
    1699747200,
    {
      ethereum: {
        allbridge: 320.55332654125294,
      },
      bsc: {
        allbridge: 268.8368901875498,
      },
      arbitrum: {
        allbridge: 43.308296888330005,
      },
      polygon: {
        allbridge: 35.486818984692,
      },
    },
  ],
  [
    1699833600,
    {
      ethereum: {
        allbridge: 341.4951865516599,
      },
      bsc: {
        allbridge: 186.69214645848365,
      },
      arbitrum: {
        allbridge: 36.8057649674,
      },
      polygon: {
        allbridge: 17.041552554217,
      },
    },
  ],
  [
    1699920000,
    {
      ethereum: {
        allbridge: 260.70480833453996,
      },
      bsc: {
        allbridge: 134.45832812992316,
      },
      arbitrum: {
        allbridge: 48.80902528716001,
      },
      polygon: {
        allbridge: 40.610034025660006,
      },
    },
  ],
  [
    1700006400,
    {
      ethereum: {
        allbridge: 206.86444214590998,
      },
      bsc: {
        allbridge: 95.4529218036562,
      },
      arbitrum: {
        allbridge: 109.19197270394002,
      },
      polygon: {
        allbridge: 84.37914165371008,
      },
    },
  ],
  [
    1700092800,
    {
      ethereum: {
        allbridge: 311.83327055544794,
      },
      bsc: {
        allbridge: 214.21393944246717,
      },
      arbitrum: {
        allbridge: 82.56912716342298,
      },
      polygon: {
        allbridge: 68.983203947608,
      },
    },
  ],
  [
    1700179200,
    {
      ethereum: {
        allbridge: 113.58121801799996,
      },
      bsc: {
        allbridge: 574.7934528329904,
      },
      arbitrum: {
        allbridge: 90.37644711,
      },
      polygon: {
        allbridge: 39.84776044800002,
      },
    },
  ],
  [
    1700265600,
    {
      ethereum: {
        allbridge: 379.110703117,
      },
      bsc: {
        allbridge: 528.8328014577545,
      },
      arbitrum: {
        allbridge: 70.23833800000003,
      },
      polygon: {
        allbridge: 27.360270246999992,
      },
    },
  ],
  [
    1700352000,
    {
      ethereum: {
        allbridge: 179.30235916337793,
      },
      bsc: {
        allbridge: 36.43809343833067,
      },
      arbitrum: {
        allbridge: 96.44690517184402,
      },
      polygon: {
        allbridge: 14.733362473574,
      },
    },
  ],
  [
    1700438400,
    {
      ethereum: {
        allbridge: 885.0368872223744,
      },
      bsc: {
        allbridge: 401.130911237103,
      },
      arbitrum: {
        allbridge: 184.81008257475003,
      },
      polygon: {
        allbridge: 90.45703225610804,
      },
    },
  ],
  [
    1700524800,
    {
      ethereum: {
        allbridge: 605.9206450277584,
      },
      bsc: {
        allbridge: 188.82279247555988,
      },
      arbitrum: {
        allbridge: 152.15287621129607,
      },
      polygon: {
        allbridge: 154.49111523036805,
      },
    },
  ],
  [
    1700611200,
    {
      ethereum: {
        allbridge: 1251.4689155942008,
      },
      bsc: {
        allbridge: 410.8459523380051,
      },
      arbitrum: {
        allbridge: 130.50692202633502,
      },
      polygon: {
        allbridge: 163.65411471954192,
      },
    },
  ],
  [
    1700697600,
    {
      ethereum: {
        allbridge: 578.4420802619996,
      },
      bsc: {
        allbridge: 130.24532660216784,
      },
      arbitrum: {
        allbridge: 42.54772,
      },
      polygon: {
        allbridge: 89.04320567200003,
      },
    },
  ],
  [
    1700784000,
    {
      ethereum: {
        allbridge: 289.75111500000014,
      },
      bsc: {
        allbridge: 103.46307236626106,
      },
      arbitrum: {
        allbridge: 114.22490899999998,
      },
      polygon: {
        allbridge: 110.80867405899988,
      },
    },
  ],
  [
    1700870400,
    {
      ethereum: {
        allbridge: 775.643190461,
      },
      bsc: {
        allbridge: 73.80688027364823,
      },
      arbitrum: {
        allbridge: 149.7353908049999,
      },
      polygon: {
        allbridge: 106.53613250600006,
      },
    },
  ],
  [
    1700956800,
    {
      ethereum: {
        allbridge: 433.41955772711617,
      },
      bsc: {
        allbridge: 213.78193361241972,
      },
      arbitrum: {
        allbridge: 132.93315804495305,
      },
      polygon: {
        allbridge: 152.94811776159992,
      },
    },
  ],
  [
    1701043200,
    {
      ethereum: {
        allbridge: 945.108989531671,
      },
      bsc: {
        allbridge: 629.8897714132186,
      },
      arbitrum: {
        allbridge: 90.85514299999998,
      },
      polygon: {
        allbridge: 134.57901818071304,
      },
    },
  ],
  [
    1701129600,
    {
      ethereum: {
        allbridge: 1223.9040083459997,
      },
      bsc: {
        allbridge: 211.37599454977305,
      },
      arbitrum: {
        allbridge: 65.15467499999998,
      },
      polygon: {
        allbridge: 78.88627501354595,
      },
    },
  ],
  [
    1701216000,
    {
      ethereum: {
        allbridge: 956.1229989999999,
      },
      bsc: {
        allbridge: 249.31270468717327,
      },
      arbitrum: {
        allbridge: 113.94159000000009,
      },
      polygon: {
        allbridge: 115.61617195000002,
      },
    },
  ],
  [
    1701302400,
    {
      ethereum: {
        allbridge: 1558.519354706463,
      },
      bsc: {
        allbridge: 377.2561174569443,
      },
      arbitrum: {
        allbridge: 95.71830522998434,
      },
      polygon: {
        allbridge: 140.76316800000004,
      },
    },
  ],
  [
    1701388800,
    {
      ethereum: {
        allbridge: 2132.5503891620006,
      },
      bsc: {
        allbridge: 490.8977761587225,
      },
      arbitrum: {
        allbridge: 0,
      },
      polygon: {
        allbridge: 182.5430121270001,
      },
    },
  ],
  [
    1701475200,
    {
      ethereum: {
        allbridge: 1408.0357068348198,
      },
      bsc: {
        allbridge: 311.7503647203732,
      },
      arbitrum: {
        allbridge: 202.43718282607992,
      },
      polygon: {
        allbridge: 266.7902790747502,
      },
    },
  ],
  [
    1701561600,
    {
      ethereum: {
        allbridge: 3589.8630547779976,
      },
      bsc: {
        allbridge: 548.5789160173806,
      },
      arbitrum: {
        allbridge: 198.81301339900008,
      },
      polygon: {
        allbridge: 610.8930840448473,
      },
    },
  ],
  [
    1701648000,
    {
      ethereum: {
        allbridge: 3171.6747832939973,
      },
      bsc: {
        allbridge: 433.09700003718604,
      },
      arbitrum: {
        allbridge: 250.77575723199988,
      },
      polygon: {
        allbridge: 322.75541492199983,
      },
    },
  ],
  [
    1701734400,
    {
      ethereum: {
        allbridge: 1904.3053488342277,
      },
      bsc: {
        allbridge: 229.21783831222984,
      },
      arbitrum: {
        allbridge: 218.66514369699996,
      },
      polygon: {
        allbridge: 266.7780781195916,
      },
    },
  ],
  [
    1701820800,
    {
      ethereum: {
        allbridge: 4038.7881777170023,
      },
      bsc: {
        allbridge: 421.59009881162007,
      },
      arbitrum: {
        allbridge: 337.50065399999977,
      },
      polygon: {
        allbridge: 299.5672599100001,
      },
    },
  ],
  [
    1701907200,
    {
      ethereum: {
        allbridge: 2125.8093230742516,
      },
      bsc: {
        allbridge: 407.14216407910965,
      },
      arbitrum: {
        allbridge: 306.57669012287477,
      },
      polygon: {
        allbridge: 420.21817470430193,
      },
    },
  ],
  [
    1701993600,
    {
      ethereum: {
        allbridge: 7871.918926174885,
      },
      bsc: {
        allbridge: 698.8565354160187,
      },
      arbitrum: {
        allbridge: 531.3279440857517,
      },
      polygon: {
        allbridge: 726.4955928729602,
      },
    },
  ],
  [
    1702080000,
    {
      ethereum: {
        allbridge: 3434.2503049999978,
      },
      bsc: {
        allbridge: 490.2179862042142,
      },
      arbitrum: {
        allbridge: 433.8843529999998,
      },
      polygon: {
        allbridge: 411.55608261996764,
      },
    },
  ],
  [
    1702166400,
    {
      ethereum: {
        allbridge: 2121.3817499229986,
      },
      bsc: {
        allbridge: 579.6192787086171,
      },
      arbitrum: {
        allbridge: 352.2310982189997,
      },
      polygon: {
        allbridge: 754.1549533640001,
      },
    },
  ],
  [
    1702252800,
    {
      ethereum: {
        allbridge: 1309.1305792520016,
      },
      bsc: {
        allbridge: 478.2804137711997,
      },
      arbitrum: {
        allbridge: 190.64771600000012,
      },
      polygon: {
        allbridge: 500.23910937390576,
      },
    },
  ],
  [
    1702339200,
    {
      ethereum: {
        allbridge: 2322.471381782211,
      },
      bsc: {
        allbridge: 520.2024659181855,
      },
      arbitrum: {
        allbridge: 563.0439907596241,
      },
      polygon: {
        allbridge: 495.85683708305953,
      },
    },
  ],
  [
    1702425600,
    {
      ethereum: {
        allbridge: 2322.902226913621,
      },
      bsc: {
        allbridge: 541.4499987879088,
      },
      arbitrum: {
        allbridge: 238.39773564369017,
      },
      polygon: {
        allbridge: 395.47668359711673,
      },
    },
  ],
  [
    1702512000,
    {
      ethereum: {
        allbridge: 2186.572760501999,
      },
      bsc: {
        allbridge: 269.8834818931452,
      },
      arbitrum: {
        allbridge: 282.83565610299996,
      },
      polygon: {
        allbridge: 281.99148304300013,
      },
    },
  ],
  [
    1702598400,
    {
      ethereum: {
        allbridge: 8418.712826559187,
      },
      bsc: {
        allbridge: 969.913440900315,
      },
      arbitrum: {
        allbridge: 317.7406496293501,
      },
      polygon: {
        allbridge: 711.5122503427979,
      },
    },
  ],
  [
    1702684800,
    {
      ethereum: {
        allbridge: 4295.2436594494,
      },
      bsc: {
        allbridge: 447.92227451954,
      },
      arbitrum: {
        allbridge: 91.42156523499999,
      },
      polygon: {
        allbridge: 560.7274781406395,
      },
    },
  ],
  [
    1702771200,
    {
      ethereum: {
        allbridge: 2812.861965175636,
      },
      bsc: {
        allbridge: 890.3503292179822,
      },
      arbitrum: {
        allbridge: 198.01165200000014,
      },
      polygon: {
        allbridge: 506.9482331454521,
      },
    },
  ],
  [
    1702857600,
    {
      ethereum: {
        allbridge: 2848.5462943283296,
      },
      bsc: {
        allbridge: 386.44866420706927,
      },
      arbitrum: {
        allbridge: 310.6053052653201,
      },
      polygon: {
        allbridge: 491.50621224180384,
      },
    },
  ],
  [
    1702944000,
    {
      ethereum: {
        allbridge: 5352.04411603853,
      },
      bsc: {
        allbridge: 372.20550682179953,
      },
      arbitrum: {
        allbridge: 207.37024799999998,
      },
      polygon: {
        allbridge: 560.4659666595046,
      },
    },
  ],
  [
    1703030400,
    {
      ethereum: {
        allbridge: 4416.5751754830035,
      },
      bsc: {
        allbridge: 731.0922459261246,
      },
      arbitrum: {
        allbridge: 195.0533090000001,
      },
      polygon: {
        allbridge: 522.1304460489996,
      },
    },
  ],
  [
    1703116800,
    {
      ethereum: {
        allbridge: 5945.529695011995,
      },
      bsc: {
        allbridge: 443.73605628287646,
      },
      arbitrum: {
        allbridge: 459.9939614269995,
      },
      polygon: {
        allbridge: 515.4533552600001,
      },
    },
  ],
  [
    1703203200,
    {
      ethereum: {
        allbridge: 6469.28751028427,
      },
      bsc: {
        allbridge: 591.537113469399,
      },
      arbitrum: {
        allbridge: 382.8318543232475,
      },
      polygon: {
        allbridge: 831.702405786119,
      },
    },
  ],
  [
    1703289600,
    {
      ethereum: {
        allbridge: 4034.333243171132,
      },
      bsc: {
        allbridge: 504.0406903232647,
      },
      arbitrum: {
        allbridge: 536.0033261014379,
      },
      polygon: {
        allbridge: 301.34293344346327,
      },
    },
  ],
  [
    1703376000,
    {
      ethereum: {
        allbridge: 5524.0673517153145,
      },
      bsc: {
        allbridge: 406.97447036648896,
      },
      arbitrum: {
        allbridge: 228.37358533174,
      },
      polygon: {
        allbridge: 678.1442000222986,
      },
    },
  ],
  [
    1703462400,
    {
      ethereum: {
        allbridge: 3746.0514216703264,
      },
      bsc: {
        allbridge: 631.7221803476697,
      },
      arbitrum: {
        allbridge: 310.864024036851,
      },
      polygon: {
        allbridge: 483.26238206933215,
      },
    },
  ],
  [
    1703548800,
    {
      ethereum: {
        allbridge: 4417.061190074763,
      },
      bsc: {
        allbridge: 338.2077492283785,
      },
      arbitrum: {
        allbridge: 302.33964460700014,
      },
      polygon: {
        allbridge: 523.4647582107315,
      },
    },
  ],
  [
    1703635200,
    {
      ethereum: {
        allbridge: 4942.785382898995,
      },
      bsc: {
        allbridge: 660.2595207232293,
      },
      arbitrum: {
        allbridge: 492.7992049999994,
      },
      polygon: {
        allbridge: 615.2108198289994,
      },
    },
  ],
  [
    1703721600,
    {
      ethereum: {
        allbridge: 5366.220924996388,
      },
      bsc: {
        allbridge: 824.3825193976195,
      },
      arbitrum: {
        allbridge: 323.1868223950083,
      },
      polygon: {
        allbridge: 619.5616927265286,
      },
    },
  ],
];
const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    try {
      // let fees = 0;
      // if (chain === CHAIN.TRON) {
      //   fees = await fetchFeesTron(chain, timestamp);
      // } else {
      //   fees = await fetchFees(chain, timestamp);
      // }
      const dailyFees = (data as [number, { [key: string]: { allbridge: number } }][]).find((d: any[]) => d[0] === timestamp)?.[1]?.[chain]?.allbridge || 0;
      // const dailyFees = fees;
      const dailyRevenue = dailyFees * 0.2;
      const dailySupplySideRevenue = dailyFees * 0.8;
      return {
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyRevenue.toString(),
        dailySupplySideRevenue: dailySupplySideRevenue.toString(),
        timestamp,
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
  };
};

const meta = {
  methodology: {
    Fees: "A 0.3% fee is charged for token swaps",
    SupplySideRevenue: "A 0.24% of each swap is distributed to liquidity providers",
    Revenue: "A 0.06% of each swap goes to governance",
  }
};

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: async () => 1684022400,
      meta,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async () => 1684022400,
      meta,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1684022400,
      meta,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1687838400,
      meta,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async () => 1698030000,
      meta,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async () => 1702868400,
      meta,
    },
    [CHAIN.TRON]: {
      fetch: fetch(CHAIN.TRON),
      start: async () => 1685109600,
      meta,
    },
  },
};

export default adapters;
