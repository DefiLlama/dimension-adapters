export type TradeVolumeResp = Record<DateString, Record<MarketAddr, VolumeString>>;

export type ChainId = string;
export type MarketAddr = string;
export type VolumeString = string;
export type DateString = string;