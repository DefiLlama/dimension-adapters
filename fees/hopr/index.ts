import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import * as sdk from "@defillama/sdk";

const channels_address = '0x693Bac5ce61c720dDC68533991Ceb41199D8F8ae';
const wxHOPR_address = ADDRESSES.xdai.XHOPR;
const xHOPR_address = '0xd057604a14982fe8d88c5fc25aac3267ea142a08';
const chain = 'xdai';
const topic0 = '0x7165e2ebc7ce35cc98cb7666f9945b3617f3f36326b76d18937ba5fecf18739a'; //TicketRedeemed
const topic1 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; //Transfer
const topic2 = '0x000000000000000000000000693bac5ce61c720ddc68533991ceb41199d8f8ae';

const methodology = {
  Fees: "Protocol has no supply-side fees, only user fees which are Sum of all ticket values redeemed in wxHOPR internally in the channels contract and also to the HOPR safe address",
  Revenue: "Sum of number of all tickets redeemed multiplied by ticket price in wxHOPR internally in the channels contract and also to the HOPR safe address",
}

interface ITx {
  data: string;
  transactionHash: string;
}

const fetch = async ({ toTimestamp, getLogs, createBalances, }: FetchOptions) => {
  const provider = sdk.getProvider('xdai');
  const iface = new ethers.Interface(['function execTransactionFromModule(address to,uint256 value,bytes data,uint8 operation)'])

  const ticketRedeemedLogs: ITx[] = await getLogs({
    target: channels_address,
    eventAbi: 'event TicketRedeemed (bytes32 indexed channelId, uint48 newTicketIndex)', entireLog: true,
  })

  const erc20transferLog: ITx[] = await getLogs({
    target: wxHOPR_address, topics: [topic1, topic2], entireLog: true,
    eventAbi: 'event Transfer (address indexed from, address indexed to, uint256 value)',
  });
  const erc20TransferMap = new Map(erc20transferLog.map(transaction => [transaction.transactionHash.toLowerCase(), transaction.data]));

  let dailyRevenueStayedInChannelsTXs: string[] = [];
  const dailyRevenueArrayPaidToSafe = ticketRedeemedLogs.map(ticket => {
    const transactionHash = ticket.transactionHash.toLowerCase();
    const data = erc20TransferMap[transactionHash];
    if (data)
      return data.args.value
    dailyRevenueStayedInChannelsTXs.push(ticket.transactionHash);
  }).filter(elem => elem !== undefined) as string[];

  const dailyRevenueStayedInChannels = await Promise.all(dailyRevenueStayedInChannelsTXs.map(async (transactionHash) => {
    const tx = await provider.getTransaction(transactionHash) as any;
    const data = tx!.input;
    const decodedInput = iface.decodeFunctionData('execTransactionFromModule', data)
    const hexValue = '0x' + decodedInput[2].substring(138, 202);
    return hexValue;
  }));

  const dailyRevenue = dailyRevenueArrayPaidToSafe.concat(dailyRevenueStayedInChannels)

  const dailyFees = createBalances();
  dailyFees.add(xHOPR_address, dailyRevenue);
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.XDAI]: {
      fetch: fetch,
      start: '2023-08-31',
    },
  }
}

export default adapter;
