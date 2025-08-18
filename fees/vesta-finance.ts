import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";

const event_redemption = 'event Redemption(address indexed _asset,uint256 _attemptedVSTAmount,uint256 _actualVSTAmount,uint256 _AssetSent,uint256 _AssetFee)';
const event_borrow_fees_paid = 'event VSTBorrowingFeePaid(address indexed _asset,address indexed _borrower,uint256 _VSTFee)';
const event_interate_mint = 'event InterestMinted(address indexed module,uint256 interestMinted)';
const event_liq_event = 'event Liquidation(address indexed _asset,uint256 _liquidatedDebt,uint256 _liquidatedColl,uint256 _collGasCompensation,uint256 _VSTGasCompensation)';
const event_reward_staker = 'event RewardReceived(uint256 reward)';

const VST_ADDRESS = "0x64343594ab9b56e99087bfa6f2335db24c2d1f17";
const GMX_STAKER = "0xB9b8f95568D5a305c6D70D10Cc1361d9Df3e9F9a";
const GLP_STAKER = "0xDB607928F10Ca503Ee6678522567e80D8498D759";


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

const fetch = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances();
    (await getLogs({ target: address[chain], eventAbi: event_borrow_fees_paid })).forEach((e: any) => {
      dailyFees.add(VST_ADDRESS, e._VSTFee)
    });

    (await getLogs({ target: invest_addres[chain], eventAbi: event_interate_mint })).forEach((e: any) => {
      dailyFees.add(VST_ADDRESS, e.interestMinted)
    });

    (await getLogs({ target: troveMagaer[chain], eventAbi: event_redemption })).forEach((e: any) => {
      dailyFees.add(e._asset, e._AssetFee)
    });

    (await getLogs({ target: troveMagaer[chain], eventAbi: event_liq_event })).forEach((e: any) => {
      dailyFees.add(e._asset, e._liquidatedColl)
      dailyFees.add(VST_ADDRESS, e._liquidatedDebt * -1)
    });

    (await getLogs({ target: GMX_STAKER, eventAbi: event_reward_staker, }))
      .map((e: any) => { dailyFees.addGasToken(e.reward) });

    (await getLogs({ target: GLP_STAKER, eventAbi: event_reward_staker, }))
      .map((e: any) => { dailyFees.addGasToken(e.reward) });

    return { dailyFees, dailyRevenue: dailyFees, timestamp }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2022-12-29',
    },
  }
}

export default adapter;