import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryIndexer } from "../../helpers/indexer";

type IMapDieselToken = {
  [l: string]: string;
};

const mapDieselToken: IMapDieselToken = {
  "0x6CFaF95457d7688022FC53e7AbE052ef8DFBbdBA": ADDRESSES.ethereum.DAI,
  "0xc411dB5f5Eb3f7d552F9B8454B2D74097ccdE6E3": ADDRESSES.ethereum.USDC,
  "0xF21fc650C1B34eb0FDE786D52d23dA99Db3D6278": ADDRESSES.ethereum.WETH,
  "0xe753260F1955e8678DCeA8887759e07aa57E8c54": ADDRESSES.ethereum.WBTC,
  "0x2158034dB06f06dcB9A786D2F1F8c38781bA779d": ADDRESSES.ethereum.WSTETH,
  "0xba3335588d9403515223f109edc4eb7269a9ab5d": "0xba3335588d9403515223f109edc4eb7269a9ab5d",
  [ADDRESSES.ethereum.WETH]: ADDRESSES.ethereum.WETH,
  [ADDRESSES.ethereum.WBTC]: ADDRESSES.ethereum.WBTC,
  [ADDRESSES.ethereum.DAI]: ADDRESSES.ethereum.DAI,
  [ADDRESSES.ethereum.USDC]: ADDRESSES.ethereum.USDC,
  [ADDRESSES.ethereum.WSTETH]: ADDRESSES.ethereum.WSTETH,
  "0x8a1112afef7f4fc7c066a77aabbc01b3fff31d47": ADDRESSES.ethereum.FRAX,
  [ADDRESSES.ethereum.FRAX]: ADDRESSES.ethereum.FRAX,
  "0xda00000035fef4082f78def6a8903bee419fbf8e": ADDRESSES.ethereum.USDC,
  "0xda0002859b2d05f66a753d8241fcde8623f26f4f": ADDRESSES.ethereum.WETH,
  "0xda00010eda646913f273e10e7a5d1f659242757d": ADDRESSES.ethereum.WBTC,
  [ADDRESSES.ethereum.USDC]: "0xda00000035fef4082f78def6a8903bee419fbf8e",
  [ADDRESSES.ethereum.WETH]: "0xda0002859b2d05f66a753d8241fcde8623f26f4f",
  [ADDRESSES.ethereum.WBTC]: "0xda00010eda646913f273e10e7a5d1f659242757d",
};

Object.keys(mapDieselToken).forEach((key: string) => mapDieselToken[key.toLowerCase()] = mapDieselToken[key])


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


const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {

  const dailyFees = options.createBalances();

  const logEventTranferErc20ToTreasury = await queryIndexer(`
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
      AND block_time BETWEEN llama_replace_date_range
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
      AND block_time BETWEEN llama_replace_date_range;
      `, options);

  const logEventTxToTreasury = await queryIndexer(`
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
      AND block_time BETWEEN llama_replace_date_range
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
      AND block_time BETWEEN llama_replace_date_range;
      `, options);

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

  const logs_contract: ILog[] = await queryIndexer(`
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
      AND block_time BETWEEN llama_replace_date_range;
      `, options) as any;

  const logHashs: string[] = logs_contract.map((e: ILog) => e.transaction_hash);
  const hashEvent = [...new Set([...logHashs])].map((e: string) => e.toLowerCase());
  logEventTranfer
    .filter((e: ITx) => hashEvent.includes(e.transactionHash))
    .forEach((transfer_events: ITx, _: number) => {
      if (!transfer_events?.token || tokenBlacklist.includes(transfer_events?.token)) return;
      const token = mapDieselToken[transfer_events!.token!.toLowerCase()] ?? transfer_events?.token;
      dailyFees.add(token, transfer_events.data)
    });
  const dailyRevenue = dailyFees.clone()
  dailyRevenue.resizeBy(0.5);
  return { timestamp, dailyFees, dailyRevenue, };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1665360000,
    },
  },
};

export default adapter;
