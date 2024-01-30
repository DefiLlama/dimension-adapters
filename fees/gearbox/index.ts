import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { getPrices } from "../../utils/prices";
import postgres from "postgres";

type IMapDieselToken = {
  [l: string]: string;
};

const mapDieselToken: IMapDieselToken = {
  "0x6CFaF95457d7688022FC53e7AbE052ef8DFBbdBA": "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0xc411dB5f5Eb3f7d552F9B8454B2D74097ccdE6E3": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xF21fc650C1B34eb0FDE786D52d23dA99Db3D6278": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "0xe753260F1955e8678DCeA8887759e07aa57E8c54": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  "0x2158034dB06f06dcB9A786D2F1F8c38781bA779d": "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  "0xba3335588d9403515223f109edc4eb7269a9ab5d": "0xba3335588d9403515223f109edc4eb7269a9ab5d",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "0x6b175474e89094c44da98b954eedeac495271d0f",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  "0x8a1112afef7f4fc7c066a77aabbc01b3fff31d47": "0x853d955aCEf822Db058eb8505911ED77F175b99e",
  "0x853d955aCEf822Db058eb8505911ED77F175b99e": "0x853d955aCEf822Db058eb8505911ED77F175b99e",
  "0xda00000035fef4082f78def6a8903bee419fbf8e": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "0xda0002859b2d05f66a753d8241fcde8623f26f4f": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "0xda00010eda646913f273e10e7a5d1f659242757d": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "0xda00000035fef4082f78def6a8903bee419fbf8e",
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "0xda0002859b2d05f66a753d8241fcde8623f26f4f",
  "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": "0xda00010eda646913f273e10e7a5d1f659242757d",
};


const tokenBlacklist = ["0xe397ef3e332256f38983ffae987158da3e18c5ec", "0xbfa9180729f1c549334080005ca37093593fb7aa"];
interface IAmount {
  amount: number;
  amountUsd: number;
  transactionHash: string;
}
interface ITx {
  token?: string;
  data: string;
  transactionHash: string;
  event: string;
}

interface ILog {
  contract_address: string;
  transaction_hash: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const sql = postgres(process.env.INDEXA_DB!);
  try {
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
      AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()}
    union all
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
  `;

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
      AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()}
    union all
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
  `;

    const logEventTranfer: ITx[] = logEventTranferErc20ToTreasury
      .map((p: any) => {
        return {
          ...p,
          event: "ERC20",
        }
      })
      .concat(logEventTxToTreasury.map((e: any) => {
        return {
          ...e,
          event: "DAO",
        }
      }))
      .map((p: any) => {
        return {
          data: `0x${p.value}`,
          transactionHash: `0x${p.hash}`.toLowerCase(),
          token: `0x${p.contract_address}`.toLowerCase(),
          event: p.event,
        } as ITx;
      }) as ITx[];

    const logs_contract: ILog[] = (await sql`
    SELECT
      '0x' || encode(contract_address, 'hex') AS contract_address,
      '0x' || encode(transaction_hash, 'hex') AS transaction_hash
    FROM
      ethereum.event_logs
    WHERE
      block_number > 13733671 -- gearbox multisig creation block
      AND topic_0 in (
        '\\xe7c7987373a0cc4913d307f23ab8ef02e0333a2af445065e2ef7636cffc6daa7', -- repay credit account
        '\\x5e5da6c348e62989f9cfe029252433fc99009b7d28fa3c20d675520a10ff5896', -- liquidate credit account
        '\\xca05b632388199c23de1352b2e96fd72a0ec71611683330b38060c004bbf0a76', -- close credit account
        '\\xced6ab9afc868b3a088366f6631ae20752993b5cce5d5f0534ea5a59fcc57d56', -- return credit account
        '\\x460ad03b1cf79b1d64d3aefa28475f110ab66e84649c52bb41ed796b9b391981', -- close credit account v2
        '\\x7dfecd8419723a9d3954585a30c2a270165d70aafa146c11c1e1b88ae1439064' -- liquidate credit account v2
      )
      AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
    `) as ILog[];

    const coins = Object.values(mapDieselToken).map((address: string) => `ethereum:${address.toLowerCase()}`);
    const prices = await getPrices(coins, timestamp);
    const logHashs: string[] = logs_contract.map((e: ILog) => e.transaction_hash);
    const hashEvent = [...new Set([...logHashs])].map((e: string) => e.toLowerCase());
    const txAmountUSD: IAmount[] = logEventTranfer
      .filter((e: ITx) => hashEvent.includes(e.transactionHash))
      .map((transfer_events: ITx, _: number) => {
        if (tokenBlacklist.includes(transfer_events?.token || "")) {
          return {
            amount: 0,
            amountUsd: 0,
            transactionHash: transfer_events.transactionHash,
            event: transfer_events.event + "Blacklist",
          } as IAmount;
        }
        const indexTokenMap = Object.keys(mapDieselToken)
          .map((e: any) => e.toLowerCase())
          .findIndex((e: string) => e === transfer_events?.token);
        const token = Object.values(mapDieselToken)[indexTokenMap];;
        const price = prices[`ethereum:${token.toLowerCase()}`].price;
        const decimals = prices[`ethereum:${token.toLowerCase()}`].decimals;
        const amount = new BigNumber(transfer_events.data).toNumber();
        return {
          amount: amount / 10 ** decimals,
          amountUsd: (amount / 10 ** decimals) * price,
          transactionHash: transfer_events.transactionHash,
          event: transfer_events.event,
        } as IAmount;
      });
    const dailyFees = [...new Set([...txAmountUSD.map((e) => e.amountUsd)])].reduce((a: number, b: number) => a + b, 0);
    await sql.end({ timeout: 5 });
    return {
      timestamp,
      dailyFees: dailyFees.toString(),
      dailyRevenue: (dailyFees * 0.5).toString(),
    };
  } catch (e) {
    await sql.end({ timeout: 5 });
    throw e;
  }
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: async () => 1665360000,
    },
  },
};

export default adapter;
