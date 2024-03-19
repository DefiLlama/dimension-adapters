import {ethers} from 'ethers'
import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { promises } from 'dns';
import { getBlock } from "../../helpers/getBlock";
import BigNumber from 'bignumber.js';

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

const DSProxyAbi = `function owner() external view returns(address)`

// check whether the address is DSProxy or not
async function checkIsValid(chainId: string, contractAddress: string): Promise<boolean> {
    try{

        const data = await sdk.api2.abi.call({
            target: contractAddress,
            abi: DSProxyAbi,
            chain: chainId == "10" ? CHAIN.OPTIMISM : (chainId == "42161" ? CHAIN.ARBITRUM : CHAIN.BASE),
        })
        
        if(data == "0x0000000000000000000000000000000000000000") return false

        return true
    }
    catch (err){
        return false
    }
}

async function getFeeInRange(
    currentTimestamp: number
): Promise<{ status: boolean; fee: any }> {
    let totalAmount: {
        [key: string]: any;
    } = {
        "0x5979D7b546E38E414F7E9822514be443A4800529": new BigNumber(0),
        "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8": new BigNumber(0),
        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1": new BigNumber(0),
        "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb": new BigNumber(0),
        "0x9Bcef72be871e61ED4fBbc7630889beE758eb81D": new BigNumber(0),
        "0x4200000000000000000000000000000000000006": new BigNumber(0),
        '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452': new BigNumber(0),
        '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': new BigNumber(0)
    }
    try{
        
        const transferEventTopicId = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

        // logic
        for (const chainId in supportedERC20Tokens){
            for (const tokenAddress of supportedERC20Tokens[chainId]) {
                const chain = chainId == "10" ? CHAIN.OPTIMISM : (chainId == "42161" ? CHAIN.ARBITRUM : CHAIN.BASE)
                const toBlock = (await getBlock(currentTimestamp, chain, {}));
                const fromBlock = (await getBlock(currentTimestamp - (24 * 60 * 60), chain, {}));
                const tokenLogs: any[] = (await sdk.getEventLogs({
                    target: tokenAddress,
                    toBlock: toBlock,
                    fromBlock: fromBlock,
                    chain: chain,
                    topic: transferEventTopicId,
                    topics: [transferEventTopicId]
                }))
        
                const logsMatching = tokenLogs.filter(log => log.topics[2] === '0x00000000000000000000000010cc9d85441f27a500776357758961031218e3ae'); //fee receiver
                let logsMatchingFrom:any[] = []
                for(const item of logsMatching){
                    const valid = await checkIsValid(chainId, '0x' + item.topics[1].slice(26))
                    if(valid) logsMatchingFrom.push(item)
                }
                // console.log("Log ", logsMatchingFrom.length) 
                logsMatchingFrom.forEach(log => {
                    const value = new BigNumber(log.data, 16); // Create a BigNumber from hexadecimal data
                    totalAmount[tokenAddress] = totalAmount[tokenAddress].plus(value); // Add the value to the total
                });
                
            }
        }
    
        return {
            status: true,
            fee: totalAmount
        }
    }
    catch(err){
        return {
            status: false,
            fee: totalAmount
        } 
    }
}

function fetch(){

    return async (timestamp: number) => {
        let {status, fee} = await getFeeInRange(timestamp)
        for (const key in fee) {
            fee[key] = fee[key].toString();
        }
        
        return {
          dailyFees: fee,
          timestamp: timestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    adapter: {
      [CHAIN.BASE]: {
        fetch: fetch(),
        runAtCurrTime: true,
        start: async () => 1693288689,
      }
    },
  };
  
  export default adapter;