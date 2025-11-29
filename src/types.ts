export interface PriceData {
    symbol: string;
    name?: string;  // Coin name (optional, can come from CMC or be derived)
    price: number;
    priceChange?: number;  // Absolute price change in 24h
    priceChangePercent?: number;  // Percentage price change in 24h
    volume?: number;  // Trading volume (base asset)
    quoteVolume?: number;  // Trading volume (quote asset, e.g., USDT)
    high?: number;  // 24h high price
    low?: number;  // 24h low price
    source: 'binance' | 'cmc';
    timestamp: number;
}

export type KlineArray = [number, number, number, number, number, number, number]; // [OpenTime, Open, High, Low, Close, Volume, CloseTime]

export interface KlineData {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
}

export interface ServiceConfig {
    binanceApiKey?: string;
    binanceApiSecret?: string;
    cmcApiKeys: string[];
}
