import ADDRESSES from '../helpers/coreAssets.json'
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";
import { Chain } from "@defillama/sdk/build/general";

interface tokenInfo {
  token: string;
  amount: number;
}
const fetchFees = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const now = new Date(timestamp * 1e3)
    const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
    const query = `
          SELECT
            data,
            contract_address,
            '${CHAIN.ETHEREUM}' as chain
          from
            ethereum.core.fact_event_logs
          WHERE
            contract_address ='${ADDRESSES.ethereum.USDC}'
            and topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            and (
              topics[2] = '0x0000000000000000000000006460d14dbaeb27aefec8ebef85db35defa31c3b9'
              or 
              topics[2] = '0x000000000000000000000000163c5e051049e92915017fe7bb9b8ce6182bcbb1'
              )
            AND BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'
          union all
          SELECT
            data,
            contract_address,
            '${CHAIN.OPTIMISM}' as chain
          from
            ${CHAIN.OPTIMISM}.core.fact_event_logs
          WHERE
            contract_address ='${ADDRESSES.optimism.USDC_CIRCLE}'
            and topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            and topics[2] = '0x000000000000000000000000d4ce1f1b8640c1988360a6729d9a73c85a0c80a3'
            AND BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'
          union all
          SELECT
            data,
            contract_address,
            '${CHAIN.POLYGON}' as chain
          from
            ${CHAIN.POLYGON}.core.fact_event_logs
          WHERE
            contract_address ='${ADDRESSES.polygon.USDC}'
            and topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            and topics[2] = '0x000000000000000000000000ce946931adf7afc0797de2a76270a28458f487ed'
            AND BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'
          union all
          SELECT
            data,
            contract_address,
            '${CHAIN.ARBITRUM}' as chain
          from
            ${CHAIN.ARBITRUM}.core.fact_event_logs
          WHERE
            contract_address ='${ADDRESSES.arbitrum.USDC_CIRCLE}'
            and topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            and topics[2] = '0x000000000000000000000000d4ce1f1b8640c1988360a6729d9a73c85a0c80a3'
            AND BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'
        `
    const token_tranfer = await queryFlipside(query, 260)

    const token_info: tokenInfo[] = token_tranfer.filter((e: any) => e[2] === chain).map((item: any) => {
      const token = item[1];
      const amount = Number(item[0]);
      return {
        token,
        amount
      }
    })
    const coins = [...new Set(token_info.map((item: any) => `${chain}:${item.token}`))];
    const prices = await getPrices(coins, timestamp);
    const fees = token_info.reduce((acc: number, item: any) => {
      const price = prices[`${chain}:${item.token}`]?.price || 0;
      const decimals = prices[`${chain}:${item.token}`]?.decimals || 0;
      if (price === 0 || decimals === 0) return acc;
      const fee = (Number(item.amount) / 10 ** decimals) * price;
      return acc + fee;
    }, 0)
    const dailyFees = fees;
    const dailyRevenue = dailyFees;
    const dailyProtocolRevenue = dailyFees;
    return {
      dailyFees: `${dailyFees}`,
      dailyProtocolRevenue: `${dailyProtocolRevenue}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: 1696896000
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM),
      start: 1696896000
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: 1696896000
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: 1696896000
    }
  }
}
export default adapters;
