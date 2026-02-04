import { LRUCache } from 'lru-cache';
import { ITokenStorage } from '../types';

/**
 * Memory-based token storage using LRU cache
 */
export class MemoryStorage implements ITokenStorage {
    private cache: LRUCache<string, string>;
    private hits: number = 0;
    private misses: number = 0;

    constructor(options?: { max?: number; ttl?: number }) {
        this.cache = new LRUCache<string, string>({
            max: options?.max || 10000,
            ttl: options?.ttl || 1000 * 60 * 60, // Default 1 hour
        });
    }

    async set(token: string, value: string, ttl?: number): Promise<void> {
        this.cache.set(token, value, { ttl });
    }

    async get(token: string): Promise<string | null> {
        const value = this.cache.get(token);
        if (value !== undefined) {
            this.hits++;
            return value;
        }
        this.misses++;
        return null;
    }

    async getMany(tokens: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        for (const token of tokens) {
            const value = await this.get(token);
            if (value !== null) {
                result.set(token, value);
            }
        }
        return result;
    }

    async delete(token: string): Promise<void> {
        this.cache.delete(token);
    }

    async cleanup(): Promise<void> {
        // LRU cache handles cleanup automatically
        // This method is here for interface compatibility
        this.cache.purgeStale();
    }

    getStats(): { size: number; hits: number; misses: number } {
        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
        };
    }

    /**
     * Clear all tokens (for testing)
     */
    clear(): void {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }
}
