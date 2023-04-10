import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";
import { getPrices } from "../utils/prices";
import { type } from "os";

const topic0_fee_paid = '0x150276cb173fff450b089197a2ff8a9b82d3efbf988df82ba90a00bbe48602f5';
const topic0_trove_liq = '0x44b1a33c624451b36e8d636828145aa4eb39bd6cc5e2cf623bb270d3abc38c88';
const topic0_evt_tranfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic0_liq = '0xa3f221854f649364e9a3bb384dd1ff938482664f4a0eac0f6e39a542f5193bd3';
const topic0_redemption = '0x08b6f1ce3f9ab2722e8ea40c31a3e3a806a41702c5994f29af43dc0c1f2837df';
const topic0_interest_minted = '0x2ee35aad2e33f2a57a13f55b273b9ab5bf3cdd683fe413a7d9e22bcb8b3f67dd';
const topic0_asset_sent = '0xf89c3306c782ffbbe4593aa5673e97e9ad6a8c65d240405e8986363fada66392';
const event_redemption = 'event Redemption(address indexed _asset,uint256 _attemptedVSTAmount,uint256 _actualVSTAmount,uint256 _AssetSent,uint256 _AssetFee)';
const event_trove_liq = 'event TroveLiquidated(address indexed _asset,address indexed _borrower,uint256 _debt,uint256 _coll,uint8 operation)';
const event_borrow_fees_paid = 'event VSTBorrowingFeePaid(address indexed _asset,address indexed _borrower,uint256 _VSTFee)';
const event_interate_mint = 'event InterestMinted(address indexed module,uint256 interestMinted)';
const event_liq_event = 'event Liquidation(address indexed _asset,uint256 _liquidatedDebt,uint256 _liquidatedColl,uint256 _collGasCompensation,uint256 _VSTGasCompensation)';
const event_asset_sent = 'event AssetSent(address _to,address indexed _asset,uint256 _amount)';

const VST_ADDRESS = "0x64343594ab9b56e99087bfa6f2335db24c2d1f17";
const ACTIVE_POOL_ADDRESS = "0xbe3de7fb9aa09b3fa931868fb49d5ba5fee2ebb1";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const contract_interface = new ethers.utils.Interface([
  event_redemption,
  event_trove_liq,
  event_borrow_fees_paid,
  event_interate_mint,
  event_liq_event,
  event_asset_sent,
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

interface IOutput {
  asset: string;
  fees: number;
  tx?: string;
  to?: string;
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
      .map((e: any) => Number(e.args._VSTFee._hex) / 10 ** 18);


    const redemption_logs: IOutput[] = (await sdk.api.util.getLogs({
      target: troveMagaer[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_redemption],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
      .map((e: any) => { return {...contract_interface.parseLog(e), ...e}})
      .map((e: any) => {
        return {
          asset: e.args._asset,
          fees: Number(e.args._AssetFee._hex),
          tx: e.transactionHash
        }
      });

    const liq_logs: any[] = (await sdk.api.util.getLogs({
      target: troveMagaer[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_liq],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
      .map((e: any) => { return { ...contract_interface.parseLog(e), ...e}})
      .map((e: any) => {
        return {
          asset: e.args._asset,
          fees: Number(e.args._liquidatedColl._hex),
          tx: e.transactionHash
        }
      });
    const liq_hash = liq_logs.map((e: any) => e.tx.toLowerCase())
    const vst_burn_amount: number = (await Promise.all(
      liq_logs.map((e: IOutput) => sdk.api.util.getLogs({
        target: VST_ADDRESS,
        topic: '',
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [
          topic0_evt_tranfer,
          ethers.utils.hexZeroPad(ethers.utils.hexStripZeros(e.asset), 32),
          ethers.utils.hexZeroPad(ethers.utils.hexStripZeros(ZERO_ADDRESS), 32)],
        keys: [],
        chain: chain,
    })))).map((e: any) => e.output.map((p: any) => {
      return {
        data: p.data,
        transactionHash: p.transactionHash
      } as ITx
    }))
      .flat()
      .filter((e: ITx) => liq_hash.includes(e.transactionHash.toLowerCase()))
      .map((e: ITx) => {
        return Number(e.data) / 10 ** 18;
      }).reduce((a: number, b: number) => a+b,0);

    const asset_liq = liq_logs.map((e: IOutput) => e.asset.toLowerCase())
    const asset_sent_logs: any[] = (await sdk.api.util.getLogs({
      target: ACTIVE_POOL_ADDRESS,
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [
        topic0_asset_sent
      ],
      keys: [],
      chain: chain,
    })).output
      .map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
      .filter((e: ITx) => liq_hash.includes(e.transactionHash.toLowerCase()))
      .map((e: any) => {return { ...contract_interface.parseLog(e), ...e}})
      .filter((e: any) => asset_liq.includes(e.args._to.toLowerCase()))
      .map((e: any) => {
        return {
          asset: e.args._asset,
          fees: Number(e.args._amount._hex),
          tx: e.transactionHash
        }
      });

    const liq_trove_logs: IOutput[] = (await sdk.api.util.getLogs({
      target: troveMagaer[chain],
      topic: '',
      fromBlock: fromBlock,
      toBlock: toBlock,
      topics: [topic0_trove_liq],
      keys: [],
      chain: chain
    })).output.map((e: any) => { return { data: e.data, transactionHash: e.transactionHash, topics: e.topics } as ITx})
      .map((e: any) => contract_interface.parseLog(e))
      .map((e: any) => {
        return {
          asset: e.args._asset,
          fees: Number(e.args._debt._hex)
        }
      });

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

    const rawCoins = [
      ...redemption_logs.map((e: IOutput) => e.asset),
      ...liq_trove_logs.map((e: IOutput) => e.asset),
      VST_ADDRESS
    ].map((e: string) => `${chain}:${e.toLowerCase()}`);
    const coins = [...new Set(rawCoins)]
    const prices = await getPrices(coins, timestamp);
    const vst_price = prices[`${chain}:${VST_ADDRESS.toLowerCase()}`].price;

    const redemption_fees = redemption_logs.map((e: IOutput) => {
      const price = prices[`${chain}:${e.asset.toLowerCase()}`];
      return (e.fees /  10 ** price.decimals) * price.price;
    }).reduce((a: number, b: number) => a+b,0);


    const liq_trove_fees = liq_trove_logs.map((e: IOutput) => {
      const price = prices[`${chain}:${e.asset.toLowerCase()}`];
      return (e.fees /  10 ** price.decimals) * price.price;
    }).reduce((a: number, b: number) => a+b,0);

    const asset_sent = asset_sent_logs.map((e: IOutput) => {
      const price = prices[`${chain}:${e.asset.toLowerCase()}`];
      return (e.fees /  10 ** price.decimals) * price.price;
    }).reduce((a: number, b: number) => a+b,0);

    const liq_trove_fees_usd = liq_trove_fees * (0.5 / 100) + 30;
    const borrow_paid_fees = fee_paid_logs.reduce((a: number, b: number) => a+b,0);
    const interate_mint_fees = interate_mint_logs.reduce((e: number,b: number) => e+b,0)
    const vst_burn_amount_usd = vst_price * vst_burn_amount;
    const liq_fees_usd = asset_sent - vst_burn_amount_usd;
    const dailyFees = (borrow_paid_fees + interate_mint_fees + redemption_fees + liq_trove_fees_usd + liq_fees_usd);
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyFees.toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1672272000,
    },
  }
}

export default adapter;
