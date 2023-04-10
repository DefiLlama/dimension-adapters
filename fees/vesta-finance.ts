import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

const topic0_fee_paid = '0x150276cb173fff450b089197a2ff8a9b82d3efbf988df82ba90a00bbe48602f5';
const topic0_liq = '0x44b1a33c624451b36e8d636828145aa4eb39bd6cc5e2cf623bb270d3abc38c88';
const topic0_redemption = '0x08b6f1ce3f9ab2722e8ea40c31a3e3a806a41702c5994f29af43dc0c1f2837df';
const topic0_interest_minted = '0x2ee35aad2e33f2a57a13f55b273b9ab5bf3cdd683fe413a7d9e22bcb8b3f67dd';
const event_redemption = 'event Redemption(address indexed _asset,uint256 _attemptedVSTAmount,uint256 _actualVSTAmount,uint256 _AssetSent,uint256 _AssetFee)';
const event_trove_liq = 'event TroveLiquidated(address indexed _asset,address indexed _borrower,uint256 _debt,uint256 _coll,uint8 operation)';
const event_borrow_fees_paid = 'event VSTBorrowingFeePaid(address indexed _asset,address indexed _borrower,uint256 _VSTFee)';
const event_interate_mint = 'event InterestMinted(address indexed module,uint256 interestMinted)';

const contract_interface = new ethers.utils.Interface([
  event_redemption,
  event_trove_liq,
  event_borrow_fees_paid,
  event_interate_mint,
]);

type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.ARBITRUM]: '0x3eedf348919d130954929d4ff62d626f26adbfa2',
}
const troveMagaer: TAddress = {
  [CHAIN.ARBITRUM]: '0x100EC08129e0FD59959df93a8b914944A3BbD5df'
}
const invest_addres: TAddress = {
  [CHAIN.ARBITRUM]: '0x0f5d5e424765bf3b49f932f0e9b8e6f3791d33b1'
}

interface ITx {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IRedenptionOutput {
  asset: string;
  fees: number;
}


const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

    const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
    const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));
    const fee_paid_logs: number[] = (await sdk.api.util.getLogs({
      target: address[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_fee_paid],
      keys: [],
      chain: chain
    })).output
    .map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
    .map((e: any) => contract_interface.parseLog(e))
    .map((e: any) => Number(e.args._VSTFee._hex));


    const redemption_logs: IRedenptionOutput[] = (await sdk.api.util.getLogs({
      target: troveMagaer[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_redemption],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
    .map((e: any) => contract_interface.parseLog(e))
    .map((e: any) => {
      return {
        asset: e.args._asset,
        fees: Number(e.args._AssetFee._hex)
      }
    });

    const liq_logs = (await sdk.api.util.getLogs({
      target: troveMagaer[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_liq],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
    .map((e: any) => contract_interface.parseLog(e));

    const interate_mint_logs = (await sdk.api.util.getLogs({
      target: invest_addres[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_interest_minted],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
    .map((e: any) => contract_interface.parseLog(e))
    .map((e: any) => Number(e.args.interestMinted._hex) / 10 ** 18);
    console.log(interate_mint_logs.reduce((e,b) => e+b,0))


    // const borrow_paid_fees = fee_paid_logs.reduce((a: number, b: number) => a+b,0);
    // const dailyFees = (borrow_paid_fees);
    return {
      dailyFees: '0',
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1,
    },
  }
}

export default adapter;
