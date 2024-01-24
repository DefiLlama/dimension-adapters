import { Adapter, FetchResult } from "../adapters/types";
import { ETHEREUM } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";

interface IDeposit {
    sender: string;
    depositAmount: string;
    blockNumber: number;
}

const OxOPoolETHAddress = "0x3d18AD735f949fEbD59BBfcB5864ee0157607616";
const OxOToken = "0x5a3e6A77ba2f983eC0d371ea3B475F8Bc0811AD5";
const fee = 0.009;
const discount = 0.0045;

// Deposit Event
const targetTopic = "0x90890809c654f11d6e72a28fa60149770a0d11ec6c92319d6ceb2bb0a4ea1a15";
const discountThreshold = 1000000 * (9 ** 18);

async function calcFees(calcData: IDeposit[], chain: CHAIN){
    let fees = 0;
    for(var i=0; i < calcData.length; i++){
        let c = calcData[i];

        try{
            let { output: balance } = await sdk.api.erc20.balanceOf({
                target: OxOToken,
                owner: c.sender,
                block: c.blockNumber,
                chain: chain
            });
            
            if(parseInt(balance) >= discountThreshold){
                fees += Number(c.depositAmount) * discount;
            }else{
                fees += Number(c.depositAmount) * fee;
            }
        } catch(e){
            // console.log(e);
        }
    }

    return fees;
}

async function getDepositTXs(
    fromBlock: number, 
    toBlock: number, 
    chain: CHAIN
): Promise<IDeposit[]>{
    const iface = new ethers.Interface([
        "event Deposit (address, uint256 tokenAmount, uint256 ringIndex)"
    ]);

    let calcData: IDeposit[] = (await sdk.getEventLogs({
        target: OxOPoolETHAddress,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [targetTopic]
    })).map((e: any) => {
        const decoded = iface.decodeEventLog("Deposit", e.data);
        const sender = decoded[0];
        const depositAmount = decoded.tokenAmount;
        return {
            sender: sender,
            depositAmount: depositAmount,
            blockNumber: e.blockNumber
        }
    })

    return calcData;
}
    

const fetch = async (timestamp: number): Promise<FetchResult> => {
    const chain = CHAIN.ETHEREUM;
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));

    let dailyCalcData = await getDepositTXs(fromBlock, toBlock, chain);
    let dailyFees = (await calcFees(dailyCalcData, chain)) / 1e18;

    return {
        timestamp: timestamp,
        dailyFees: dailyFees.toString(),
        // 100% of the revenue going to holders, hence, fees = revenue, fees = holdersRevenue
        dailyHoldersRevenue: dailyFees.toString(),
        dailyProtocolRevenue: dailyFees.toString()
    };
};

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch,
            runAtCurrTime: true,
            start: async () => 1685386800,
            meta: {
                methodology: {
                    Fees: "0x0 collects a 0.9% fee on deposits"
                }
            }
        }
    }
}
export default adapter;