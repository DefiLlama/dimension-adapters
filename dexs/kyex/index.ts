import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { ethers } from "ethers";

const graphUrl = 'https://api.goldsky.com/api/public/project_cm0yx4qi4ne0c01r9hv1k7rwy/subgraphs/KYEXSwapV2-zetachain-mainnet/1/gn'
const graphQuery = gql`
query MyQuery {
  volumes(
    first: 1000
    block: { number_gte: 5375159 }
    orderBy: volume
    orderDirection: asc
  ) {
    timestamp_
    volume
    swapExecuted {
      amountA
      amountB
      block_number
      sender
      tokenA
      tokenB
    }
  }
}`

const fetch = async (timestamp: number) => {
      const data  = await request(
        graphUrl,
        graphQuery, 
        {},
      );
      const date = new Date(timestamp * 1000);
      const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000;
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime() / 1000;
      const dailyVolumes:string[] = [];
      let totalVolume = '0';

      data.volumes.forEach((item, index) => {
        const timestamp_ = parseInt(item.timestamp_);
        totalVolume = ethers.formatUnits(item.volume,18);
        if (timestamp_ >= startOfDay && timestamp_ <= endOfDay) {
          console.log(timestamp_,item.volume);
          dailyVolumes.push(item.volume);
        }
      });
      const val = new BigNumber(dailyVolumes[dailyVolumes.length-1]).minus(new BigNumber(dailyVolumes[0])).toString()

      const dailyVolume = ethers.formatUnits(val,18);
      return {
        dailyVolume: dailyVolume,
        totalVolume: totalVolume,
        timestamp: timestamp,
      };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ZETA]: {
      fetch,
      start: 1725844149,
    },
  },
};
export default adapter;
