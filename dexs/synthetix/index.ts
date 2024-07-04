import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_modified_positions = 'event PositionModified(uint indexed id,address indexed account,uint margin,int size,int tradeSize,uint lastPrice,uint fundingIndex,uint fee,int skew)';
const event_postions_liq = 'event PositionLiquidated(uint id,address account,address liquidator,int size,uint price,uint flaggerFee,uint liquidatorFee,uint stakersFee)';

const contracts: string[] = [
  '0x5374761526175B59f1E583246E20639909E189cE',
  '0xF9DD29D2Fd9B38Cd90E390C797F1B7E0523f43A9',
  '0x5B6BeB79E959Aac2659bEE60fE0D0885468BF886',
  '0x9615B6BfFf240c44D3E33d0cd9A11f563a2e8D8B',
  '0x509072A5aE4a87AC89Fc8D64D94aDCb44Bd4b88e',
  '0xbB16C7B3244DFA1a6BF83Fcce3EE4560837763CD',
  '0x9De146b5663b82F44E5052dEDe2aA3Fd4CBcDC99',
  '0xc203A12F298CE73E44F7d45A4f59a43DBfFe204D',
  '0x3a52b21816168dfe35bE99b7C5fc209f17a0aDb1',
  '0x96690aAe7CB7c4A9b5Be5695E94d72827DeCC33f',
  '0xa1Ace9ce6862e865937939005b1a6c5aC938A11F',
  '0x0940B0A96C5e1ba33AEE331a9f950Bb2a6F2Fb25',
  '0x59b007E9ea8F89b069c43F8f45834d30853e3699',
  '0xD5fBf7136B86021eF9d0BE5d798f948DcE9C0deA',
  '0x98cCbC721cc05E28a125943D69039B39BE6A21e9',
  '0x8B9B5f94aac2316f048025B3cBe442386E85984b',
  '0x139F94E4f0e1101c1464a321CBA815c34d58B5D9',
  '0x2B3bb4c683BFc5239B029131EEf3B1d214478d93',
  '0x87AE62c5720DAB812BDacba66cc24839440048d1',
  '0x2C5E2148bF3409659967FE3684fd999A76171235',
  '0x5ed8D0946b59d015f5A60039922b870537d43689',
  '0x27665271210aCff4Fab08AD9Bb657E91866471F0',
  '0xC18f85A6DD3Bcd0516a1CA08d3B1f0A4E191A2C4',
  '0x1dAd8808D8aC58a0df912aDC4b215ca3B93D6C49',
  '0x33d4613639603c845e61A02cd3D2A78BE7d513dc',
  '0x852210F0616aC226A486ad3387DBF990e690116A',
  '0xaa94C874b91ef16C8B56A1c5B2F34E39366bD484',
  '0x31A1659Ca00F617E86Dc765B6494Afe70a5A9c1A',
  '0xB25529266D9677E9171BEaf333a0deA506c5F99A',
  '0x074B8F19fc91d6B2eb51143E1f186Ca0DDB88042',
  '0xC8fCd6fB4D15dD7C455373297dEF375a08942eCe',
  '0x442b69937a0daf9D46439a71567fABE6Cb69FBaf',
  '0x3D3f34416f60f77A0a6cC8e32abe45D32A7497cb',
  '0x69F5F465a46f324Fb7bf3fD7c0D5c00f7165C7Ea',
  '0x0EA09D97b4084d859328ec4bF8eBCF9ecCA26F1D',
  '0xD91Db82733987513286B81e7115091d96730b62A',
  '0x09F9d7aaa6Bef9598c3b676c0E19C9786Aa566a8',
  '0x031A448F59111000b96F016c37e9c71e57845096',
  '0x4308427C463CAEAaB50FFf98a9deC569C31E4E87',
  '0xdcB8438c979fA030581314e5A5Df42bbFEd744a0',
  '0x549dbDFfbd47bD5639f9348eBE82E63e2f9F777A',
  '0x6110DF298B411a46d6edce72f5CAca9Ad826C1De',
]

const fetchVolume: any = async (timestamp: number, _, { getLogs, }: FetchOptions): Promise<FetchResultVolume> => {
  let dailyVolume = 0
  const logs_modify: any[] = await getLogs({ targets: contracts, eventAbi: event_modified_positions, })
  const logs_liq: any[] = await getLogs({ targets: contracts, eventAbi: event_postions_liq, })
  logs_modify.forEach((log: any) => {
    let value = Number(log.tradeSize) * Number(log.lastPrice) / 1e36
    if (value < 0) value *= -1
    dailyVolume += value
  })
  logs_liq.forEach((log: any) => {
    let value = Number(log.size) * Number(log.price) / 1e36
    if (value < 0) value *= -1
    dailyVolume += value
  })

  return { dailyVolume, timestamp }
}
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume,
      start: 1682121600,
    },
  }
};

export default adapter;
