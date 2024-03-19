import {ethers} from 'ethers'
import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchOptions, ChainBlocks } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { promises } from 'dns';
import { getBlock } from "../../helpers/getBlock";
import { addTokensReceived } from '../../helpers/token';

const supportedERC20Tokens: Record<number, string[]> = {
    42161 : [
        "0x5979D7b546E38E414F7E9822514be443A4800529",
        "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8",
        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
    ],
    10 : [
        "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb",
        "0x9Bcef72be871e61ED4fBbc7630889beE758eb81D",
        "0x4200000000000000000000000000000000000006"
    ],
    8453: [
        '0x4200000000000000000000000000000000000006',
        '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452',
        '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22'
    ]
}

function fetch(){

    return async (timestamp: number,  _: ChainBlocks, options: FetchOptions) => {
        const tokenlist = options.chain == CHAIN.ARBITRUM 
            ? supportedERC20Tokens[42161]
            : (
                options.chain == CHAIN.OPTIMISM 
                ? supportedERC20Tokens[10]
                : supportedERC20Tokens[8453]
            )
        const fee = await addTokensReceived({ tokens: tokenlist, options, target: '0x10cc9d85441f27a500776357758961031218e3ae' })
        
        return {
          dailyFees: fee,
          timestamp: timestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    adapter: {
      [CHAIN.ARBITRUM]: {
        fetch: fetch(),
        runAtCurrTime: true,
        start: async () => 1693288689,
      },
      [CHAIN.OPTIMISM]: {
        fetch: fetch(),
        runAtCurrTime: true,
        start: async () => 1693288689,
      },
      [CHAIN.BASE]: {
        fetch: fetch(),
        runAtCurrTime: true,
        start: async () => 1693288689,
      }
    },
  };
  
  export default adapter;