import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";
import { getBlock } from "../../helpers/getBlock";
import BigNumber from "bignumber.js";
import { getPrices } from "../../utils/prices";
import postgres from 'postgres'

const creditAccountFactoryAddress = "0x444cd42baeddeb707eed823f7177b9abcc779c04";
const registyContract: any = {
  address: "0xA50d4E7D8946a7c90652339CDBd262c375d54D99",
  abis: {
    getCreditManagers: {
      "inputs": [],
      "name": "getCreditManagers",
      "outputs": [
          {
              "internalType": "address[]",
              "name": "",
              "type": "address[]"
          }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    getPools: {
      "inputs": [],
      "name": "getPools",
      "outputs": [
          {
              "internalType": "address[]",
              "name": "",
              "type": "address[]"
          }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  }
};

type IMapDieselToken = {
  [l: string]: string;
}
const dieselTokenList = [
  '0x6CFaF95457d7688022FC53e7AbE052ef8DFBbdBA',
  '0xc411dB5f5Eb3f7d552F9B8454B2D74097ccdE6E3',
  '0xF21fc650C1B34eb0FDE786D52d23dA99Db3D6278',
  '0xe753260F1955e8678DCeA8887759e07aa57E8c54',
  '0x2158034dB06f06dcB9A786D2F1F8c38781bA779d'
];

const mapDieselToken: IMapDieselToken = {
  "0x6CFaF95457d7688022FC53e7AbE052ef8DFBbdBA": "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0xc411dB5f5Eb3f7d552F9B8454B2D74097ccdE6E3": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xF21fc650C1B34eb0FDE786D52d23dA99Db3D6278": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "0xe753260F1955e8678DCeA8887759e07aa57E8c54": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  "0x2158034dB06f06dcB9A786D2F1F8c38781bA779d": "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  '0xba3335588d9403515223f109edc4eb7269a9ab5d': '0xba3335588d9403515223f109edc4eb7269a9ab5d',
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
  '0x6b175474e89094c44da98b954eedeac495271d0f': '0x6b175474e89094c44da98b954eedeac495271d0f',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0'
};


const tokenBlacklist = [
  '0xe397ef3e332256f38983ffae987158da3e18c5ec',
  '0xbfa9180729f1c549334080005ca37093593fb7aa',
]
interface IAmount {
  amount: number;
  amountUsd: number;
  transactionHash: string;
}
interface ITx {
  token?: string;
  data: string;
  transactionHash: string;
}

const removeLpTopic = "RemoveLiquidity(index_topic_1 address sender, index_topic_2 address to, uint256 amount)";
const removeLpTopic0 = "0xd8ae9b9ba89e637bcb66a69ac91e8f688018e81d6f92c57e02226425c8efbdf6";

const repayCreditAccountTopic = "RepayCreditAccount(index_topic_1 address owner, index_topic_2 address to)";
const repayCreditAccountTopic0 = "0xe7c7987373a0cc4913d307f23ab8ef02e0333a2af445065e2ef7636cffc6daa7";

const liquidateCreditAccountTopic = "LiquidateCreditAccount(index_topic_1 address owner, index_topic_2 address liquidator, uint256 remainingFunds)";
const liquidateCreditAccountTopic0 = "0x5e5da6c348e62989f9cfe029252433fc99009b7d28fa3c20d675520a10ff5896";

const closeCreditAccountTopic = "CloseCreditAccount(index_topic_1 address owner, index_topic_2 address to, uint256 remainingFunds)";
const closeCreditAccountTopic0 = "0xca05b632388199c23de1352b2e96fd72a0ec71611683330b38060c004bbf0a76";

const returnCreditAccountTopic = "ReturnCreditAccount(index_topic_1 address account)";
const returnCreditAccountTopic0 = "0xced6ab9afc868b3a088366f6631ae20752993b5cce5d5f0534ea5a59fcc57d56";

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const sql = postgres(process.env.INDEXA_DB!);
  const now = new Date(timestamp * 1e3);
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24);
  const logEventTranferErc20ToTreasury = await sql`
    SELECT
      substr(encode(topic_1, 'hex'), 25) AS origin,
      substr(encode(topic_2, 'hex'), 25) AS destination,
      encode(data, 'hex') AS value,
      encode(contract_address, 'hex') AS contract_address,
      block_time AS evt_block_time,
      encode(transaction_hash, 'hex') AS HASH
    FROM
      ethereum.event_logs
    WHERE
      block_number > 13733671 -- gearbox multisig creation block
      AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' -- erc20 transfer event
      AND topic_2 = '\\x0000000000000000000000007b065Fcb0760dF0CEA8CFd144e08554F3CeA73D1' -- erc20 transfer to gearbox multisig
      AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
  `

  const logEventTranferErc20FromTreasury = await sql`
  SELECT
    substr(encode(topic_1, 'hex'), 25) AS origin,
    substr(encode(topic_2, 'hex'), 25) AS destination,
    encode(data, 'hex') AS value,
    encode(contract_address, 'hex') AS contract_address,
    block_time AS evt_block_time,
    encode(transaction_hash, 'hex') AS HASH
  FROM
    ethereum.event_logs
  WHERE
    block_number > 13733671 -- gearbox multisig creation block
    AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' -- erc20 transfer event
    AND topic_1 = '\\x0000000000000000000000007b065Fcb0760dF0CEA8CFd144e08554F3CeA73D1' -- erc20 transfer from gearbox multisig
    AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
  `

  const logEventTxToTreasury = await sql`
    SELECT
      encode(et.from_address, 'hex') AS origin,
      encode(et.to_address, 'hex') AS destination,
      value,
      'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' AS contract_address,
      block_time AS evt_block_time,
      encode(et.hash, 'hex') AS HASH
    FROM
      ethereum.transactions et
    WHERE
      et.to_address = '\\x7b065Fcb0760dF0CEA8CFd144e08554F3CeA73D1'
      AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
  `


  const logEventTxFromTreasury = await sql`
    SELECT
      encode(et.from_address, 'hex') AS origin,
      encode(et.to_address, 'hex') AS destination,
      value,
      'c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' AS contract_address,
      block_time AS evt_block_time,
      encode(et.hash, 'hex') AS HASH
    FROM
      ethereum.transactions et
    WHERE
      et.from_address = '\\x7b065Fcb0760dF0CEA8CFd144e08554F3CeA73D1'
      AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
  `
  const logEventTranfer: ITx[] = logEventTranferErc20ToTreasury
    .concat(logEventTranferErc20FromTreasury)
    .concat(logEventTxToTreasury)
    .concat(logEventTxFromTreasury)
    .map((p: any) => {
      return {
        data: `0x${p.value}`,
        transactionHash: `0x${p.hash}`.toLowerCase(),
        token: `0x${p.contract_address}`.toLowerCase(),
      } as ITx;
    }) as ITx[];

  const creditManagersAddress: string[] = (await sdk.api.abi.call({
    target: registyContract.address,
    abi: registyContract.abis.getCreditManagers,
    chain: 'ethereum'
  })).output;

  const poolServiceAddress: string[] = (await sdk.api.abi.call({
    target: registyContract.address,
    abi: registyContract.abis.getPools,
    chain: 'ethereum'
  })).output;

  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

  const todaysBlock = (await getBlock(todaysTimestamp, 'ethereum', {}));
  const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, 'ethereum', {}));


  const logEventRemoveLp: ITx[] = (await Promise.all(
    poolServiceAddress.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: removeLpTopic,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: 'ethereum',
      topics: [removeLpTopic0]
  })))).map((e: any) => e.output.map((p: any) => {
    return {
      data: p.data,
      transactionHash: p.transactionHash
    } as ITx
  })).flat();

  const logEventRepayCreditAccount: ITx[] = (await Promise.all(
    creditManagersAddress.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: repayCreditAccountTopic,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: 'ethereum',
      topics: [repayCreditAccountTopic0]
  })))).map((e: any) => e.output.map((p: any) => {
    return {
      data: p.data,
      transactionHash: p.transactionHash
    } as ITx
  })).flat();

  const logEventLiquidateCreditAccount: ITx[] = (await Promise.all(
    creditManagersAddress.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: liquidateCreditAccountTopic,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: 'ethereum',
      topics: [liquidateCreditAccountTopic0]
  })))).map((e: any) => e.output.map((p: any) => {
    return {
      data: p.data,
      transactionHash: p.transactionHash
    } as ITx
  })).flat();

  const logEventCloseCreditAccount: ITx[] = (await Promise.all(
    creditManagersAddress.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: closeCreditAccountTopic,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: 'ethereum',
      topics: [closeCreditAccountTopic0]
  })))).map((e: any) => e.output.map((p: any) => {
    return {
      data: p.data,
      transactionHash: p.transactionHash
    } as ITx
  })).flat();

  const logEventReturnCreditAccount: ITx[] = (await sdk.api.util.getLogs({
      target: creditAccountFactoryAddress,
      topic: returnCreditAccountTopic,
      toBlock: yesterdaysBlock,
      fromBlock: todaysBlock,
      keys: [],
      chain: 'ethereum',
      topics: [returnCreditAccountTopic0]
  })).output.map((p: any) => {
    return {
      data: p.data,
      transactionHash: p.transactionHash
    } as ITx
  });

  const coins = Object.values(mapDieselToken).map((address: string) => `ethereum:${address}`);
  const prices = await getPrices(coins, timestamp);

  const logHashs: string[] = logEventRepayCreditAccount
    .concat(logEventRemoveLp)
    .concat(logEventLiquidateCreditAccount)
    .concat(logEventCloseCreditAccount)
    .concat(logEventReturnCreditAccount).map((e: ITx) => e.transactionHash);
  const hashEvent = [...new Set([...logHashs])].map((e: string) => e.toLowerCase());
  // const token = [...new Set(logEventTranfer.map(e => e.token))] // debug check token address
  const txAmountUSD: IAmount[] = logEventTranfer.filter((e: ITx) => hashEvent.includes(e.transactionHash)).map((transfer_events: ITx, _: number) => {
      if(tokenBlacklist.includes(transfer_events?.token || '')) {
        return {
          amount: 0,
          amountUsd: 0,
          transactionHash: transfer_events.transactionHash
        } as IAmount
      }
      const indexTokenMap = Object.keys(mapDieselToken).map((e: any) => e.toLowerCase()).findIndex((e: string) => e === transfer_events?.token);
      const token = Object.values(mapDieselToken)[indexTokenMap];
      const { price, decimals } = prices[`ethereum:${token.toLocaleLowerCase()}`];
        const amount = new BigNumber(transfer_events.data).toNumber();
        return {
          amount: amount / 10 ** decimals,
          amountUsd: (amount / (10 ** decimals)) * price,
          transactionHash: transfer_events.transactionHash
        } as IAmount
  });
  const dailyFees = [...new Set([...txAmountUSD.map(e => e.amountUsd)])].reduce((a: number, b: number) => a + b, 0);
  await sql.end({ timeout: 5 })
  return {
    timestamp,
    dailyFees: dailyFees.toString(),
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch,
        start: async ()  => 1665360000,
    },
  }
}

export default adapter;
