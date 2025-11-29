#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { AggregatorService } from './services/aggregator.js';

const aggregator = new AggregatorService();

const server = new Server(
    {
        name: 'crypto-mcp',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'get_price',
                description: 'Get the current price of a SINGLE cryptocurrency. For multiple cryptos, use batch_prices instead.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Cryptocurrency symbol (e.g., BTC, ETH, ASTER)',
                        },
                    },
                    required: ['symbol'],
                },
            },
            {
                name: 'batch_prices',
                description: 'Get current prices for MULTIPLE cryptocurrencies in parallel (max 50). Use this when user requests multiple crypto prices.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        symbols: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Array of cryptocurrency symbols (e.g., ["BTC", "ETH", "ASTER"])',
                            maxItems: 50
                        },
                    },
                    required: ['symbols'],
                },
            },
            {
                name: 'get_history',
                description: 'Get historical kline (candlestick) data for a cryptocurrency from Binance. Returns an array of arrays: [OpenTime, Open, High, Low, Close, Volume, CloseTime][].',
                inputSchema: {
                    type: 'object',
                    properties: {
                        symbol: {
                            type: 'string',
                            description: 'Cryptocurrency symbol (e.g., BTCUSDT)',
                        },
                        interval: {
                            type: 'string',
                            description: 'Candlestick interval (e.g., 1m, 5m, 1h, 1d)',
                            enum: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'],
                        },
                        startTime: {
                            type: 'string',
                            description: 'Start time in ISO 8601 format (e.g., 2023-01-01T00:00:00Z) or timestamp',
                        },
                        endTime: {
                            type: 'string',
                            description: 'End time in ISO 8601 format (optional, defaults to now)',
                        },
                    },
                    required: ['symbol', 'interval'],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        if (request.params.name === 'get_price') {
            const args = z
                .object({
                    symbol: z.string(),
                })
                .parse(request.params.arguments);

            const data = await aggregator.getPrice(args.symbol);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(data),
                    },
                ],
            };
        } else if (request.params.name === 'batch_prices') {
            const args = z
                .object({
                    symbols: z.array(z.string()).max(50),
                })
                .parse(request.params.arguments);

            // Fetch prices in parallel
            const results = await Promise.allSettled(
                args.symbols.map(symbol => aggregator.getPrice(symbol))
            );

            const successful = results
                .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
                .map(r => r.value);

            const failed = results
                .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
                .map(r => r.reason.message);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            id: 'batch_crypto_prices',
                            title: 'Cryptocurrency Prices',
                            count: successful.length,
                            total: args.symbols.length,
                            failed: failed.length,
                            errors: failed,
                            quotes: successful.map(item => ({
                                symbol: item.symbol,
                                name: item.name || item.symbol.replace('USDT', ''),
                                price: item.price,
                                change: item.priceChange,
                                changePercent: item.priceChangePercent,
                                volume: item.volume,
                                quoteVolume: item.quoteVolume,
                                high: item.high,
                                low: item.low
                            }))
                        }),
                    },
                ],
            };
        } else if (request.params.name === 'get_history') {
            const args = z
                .object({
                    symbol: z.string(),
                    interval: z.string(),
                    startTime: z.string().optional(),
                    endTime: z.string().optional(),
                })
                .parse(request.params.arguments);

            // Parse dates
            const start = args.startTime ? (isNaN(Number(args.startTime)) ? new Date(args.startTime).getTime() : Number(args.startTime)) : undefined;
            const end = args.endTime ? (isNaN(Number(args.endTime)) ? new Date(args.endTime).getTime() : Number(args.endTime)) : undefined;

            const data = await aggregator.getKlines(args.symbol, args.interval, start, end);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(data),
                    },
                ],
            };
        } else {
            throw new McpError(
                ErrorCode.MethodNotFound,
                `Unknown tool: ${request.params.name}`
            );
        }
    } catch (error: any) {
        console.error('Error executing tool:', error);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        error: error.message,
                    }),
                },
            ],
            isError: true,
        };
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
