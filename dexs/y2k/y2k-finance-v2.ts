import { FetchResultFees, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { queryFlipside } from "../../helpers/flipsidecrypto";
import { getPrices } from "../../utils/prices";
import { ethers } from "ethers";


const controller_address = '0xC0655f3dace795cc48ea1E2e7BC012c1eec912dC';
const factory = '0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e';
const topic0_market_create = '0xe8066e93c2c1e100c0c76002a546075b7c6b53025db53708875180c81afda250';
const topic0 = '0x4b66c73cef2a561fd3c21c2af17630b43dddcff66e6803219be3989857b29e80';
const event_market_create ='event MarketCreated (uint256 indexed marketId, address premium, address collateral, address underlyingAsset, address token, string name, uint256 strike, address controller)';

const contract_interface = new ethers.utils.Interface([
  event_market_create
]);

interface ITx {
  topics: string[];
  data: string;
  transactionHash: string;
}
interface ITransfer {
  data: string;
  contract: string;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));

  const logs_market_create: ITx[] = (await sdk.api.util.getLogs({
    target: factory,
    topic: '',
    fromBlock: 96059531,
    toBlock: toBlock,
    topics: [topic0_market_create],
    keys: [],
    chain: CHAIN.ARBITRUM
  })).output as ITx[];

  const market_create = logs_market_create.map(e => contract_interface.parseLog(e).args);
  const premium = market_create.map((e: any) => e.premium.toLowerCase());
  const collateral = market_create.map((e: any) => e.collateral.toLowerCase());
  const address  = [...new Set([...premium, ...collateral])]

  const query_tx_event_deposit = `
    SELECT data, contract_address from arbitrum.core.fact_event_logs
    WHERE topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    and topics[2] != '0x0000000000000000000000005c84cf4d91dc0acde638363ec804792bb2108258'
    and tx_hash in (SELECT tx_hash from arbitrum.core.fact_event_logs
      WHERE topics[0] = '0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7'
      and contract_address in (${address.map((a: string) => `'${a.toLowerCase()}'`).join(',')})
      and BLOCK_NUMBER > ${fromBlock} AND BLOCK_NUMBER < ${toBlock})
    and BLOCK_NUMBER > ${fromBlock} AND BLOCK_NUMBER < ${toBlock}
  `

  console.log(query_tx_event_deposit);

  const query_tx_event_raw: ITransfer[] = (await queryFlipside(query_tx_event_deposit)).map(([data, contract_address]: [string, string]) => {
    return {
      contract: contract_address,
      data: data
    } as ITransfer
  })
  const coins: string[] = [...new Set(query_tx_event_raw.map((e: ITransfer) => `${CHAIN.ARBITRUM}:${e.contract}`))];
  const prices = await getPrices(coins, timestamp);

  const dailyVolume = query_tx_event_raw.map((e: ITransfer) => {
    const price = prices[`${CHAIN.ARBITRUM}:${e.contract}`].price;
    const decimals = prices[`${CHAIN.ARBITRUM}:${e.contract}`].decimals;
    return (Number(e.data) / 10 ** decimals) * price;
  }).reduce((a: number, b: number) => a + b, 0);

  return {
    dailyVolume: `${dailyVolume}`,
    timestamp
  }
}

export default fetch;
