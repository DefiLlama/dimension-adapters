import { formatAddress } from "../utils/utils";
import { CHAIN } from "./chains";

const DefaultDexTokensBlacklisted: Record<string, Array<string>> = {
  [CHAIN.ETHEREUM]: [
    '0x044fe33895Cb7c6e4566DA8E24420C1110933a63',
  ],
  [CHAIN.BSC]: [
    '0xc71b5f631354be6853efe9c3ab6b9590f8302e81',
    '0xe6df05ce8c8301223373cf5b969afcb1498c5528',
    '0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9',
    '0xb4357054c3da8d46ed642383f03139ac7f090343',
    '0x6bdcce4a559076e37755a78ce0c06214e59e4444',
    '0x87d00066cf131ff54b72b134a217d5401e5392b6',
    '0x30c60b20c25b2810ca524810467a0c342294fc61',
    '0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16',
    '0x595e21b20e78674f8a64c1566a20b2b316bc3511',
    '0x783c3f003f172c6ac5ac700218a357d2d66ee2a2',
    '0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721',
    '0x95034f653D5D161890836Ad2B6b8cc49D14e029a',
    '0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41',
    '0xde04da55b74435d7b9f2c5c62d9f1b53929b09aa',
    '0x4fa7c69a7b69f8bc48233024d546bc299d6b03bf',
  ],
}

export function getDefaultDexTokensBlacklisted(chain: string): Array<string> {
  return DefaultDexTokensBlacklisted[chain] ? DefaultDexTokensBlacklisted[chain].map(item => formatAddress(item)) : [];
}
