/**
 * Tokenization module types
 */

/**
 * Sensitive data detection rule
 */
export interface SensitiveRule {
    /** Rule name */
    name: string;
    /** Regex pattern to match sensitive data */
    pattern: RegExp;
    /** Token prefix for this rule (e.g., 'ID_', 'EMAIL_') */
    tokenPrefix: string;
    /** Whether this rule is enabled */
    enabled: boolean;
    /** Optional description */
    description?: string;
}

/**
 * Detected sensitive data finding
 */
export interface SensitiveFinding {
    /** Matched text */
    match: string;
    /** Rule that matched */
    rule: SensitiveRule;
    /** Index in original text */
    index: number;
}

/**
 * Token storage interface
 */
export interface ITokenStorage {
    /**
     * Store a token mapping
     * @param token The token string
     * @param value The real value
     * @param ttl Time to live in milliseconds (optional)
     */
    set(token: string, value: string, ttl?: number): Promise<void>;

    /**
     * Get real value by token
     * @param token The token string
     * @returns The real value or null if not found
     */
    get(token: string): Promise<string | null>;

    /**
     * Batch get real values by tokens
     * @param tokens Array of token strings
     * @returns Map of token to real value
     */
    getMany(tokens: string[]): Promise<Map<string, string>>;

    /**
     * Delete a token mapping
     * @param token The token string
     */
    delete(token: string): Promise<void>;

    /**
     * Clean up expired tokens
     */
    cleanup(): Promise<void>;

    /**
     * Get storage statistics
     */
    getStats(): { size: number; hits?: number; misses?: number };
}

/**
 * Tokenization service configuration
 */
export interface TokenizationConfig {
    /** Maximum number of tokens to store */
    maxTokens?: number;
    /** Default TTL in milliseconds */
    ttl?: number;
    /** Custom rules to add */
    customRules?: SensitiveRule[];
    /** Rule names to disable */
    disabledRules?: string[];
    /** Storage backend ('memory' | 'redis') */
    storageType?: 'memory' | 'redis';
    /** Redis connection options (if using Redis) */
    redisOptions?: {
        host?: string;
        port?: number;
        password?: string;
    };
}

/**
 * Tokenization context
 */
export interface TokenizationContext {
    /** Session ID */
    sessionId?: string;
    /** Request ID */
    requestId?: string;
    /** Additional metadata */
    metadata?: Record<string, any>;
}
