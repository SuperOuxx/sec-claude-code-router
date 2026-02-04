import { ITokenStorage, TokenizationContext } from './types';
import { SensitiveDetector } from './SensitiveDetector';
import { TokenGenerator } from './TokenGenerator';

// Configuration constants
const TOKEN_TTL_MS = 3600 * 1000; // 1 hour default TTL
const MIN_TOKEN_LENGTH_FOR_SUFFIX_MATCH = 6; // Tokens shorter than this skip suffix matching
const MIN_HEX_LENGTH_FOR_SAFE_MATCH = 4; // Hex suffix must be at least 4 chars to avoid false positives

/**
 * Core tokenization service
 * Handles tokenization (input) and detokenization (output) of sensitive data
 */
export class TokenizationService {
    private storage: ITokenStorage;
    private detector: SensitiveDetector;
    private tokenGenerator: TokenGenerator;
    private logger?: any;

    // Regex cache for performance optimization (Bug #2)
    private regexCache = new Map<string, { fuzzy: RegExp; suffix: RegExp }>();

    constructor(
        storage: ITokenStorage,
        detector?: SensitiveDetector,
        logger?: any
    ) {
        this.storage = storage;
        this.detector = detector || new SensitiveDetector();
        this.tokenGenerator = new TokenGenerator();
        this.logger = logger;
    }

    /**
     * Tokenize text: replace sensitive data with tokens
     * @param text Text to tokenize
     * @param context Optional context
     * @returns Tokenized text
     */
    /**
     * Tokenize text: replace sensitive data with tokens
     * @param text Text to tokenize
     * @param context Optional context
     * @param activeTokens Optional set to collect generated tokens
     * @returns Tokenized text
     */
    async tokenize(text: string, context?: TokenizationContext, activeTokens?: Set<string>): Promise<string> {
        this.logger?.debug?.({ activeTokensPresent: !!activeTokens, textLen: text.length }, 'tokenize called');
        const findings = this.detector.detect(text);
        if (findings.length === 0) return text;

        let result = text;
        let offset = 0;

        for (const finding of findings) {
            const token = this.tokenGenerator.generate(finding.rule.tokenPrefix);

            // Collect active token if set provided
            if (activeTokens) {
                activeTokens.add(token);
                this.logger?.debug?.({ token, count: activeTokens.size }, 'Added active token');
            }

            // Store mapping with TTL
            await this.storage.set(token, finding.match, TOKEN_TTL_MS);

            // Replace in text, accounting for previous replacements' offset
            const startPos = finding.index + offset;
            const endPos = startPos + finding.match.length;
            result = result.slice(0, startPos) + token + result.slice(endPos);

            // Update offset for next replacement
            offset += token.length - finding.match.length;

            this.logger?.debug?.(`Tokenized: ${finding.rule.name} -> ${token}`);
        }

        this.logger?.info?.(`Tokenized ${findings.length} sensitive items in text`);
        return result;
    }

    /**
     * Detokenize text: replace tokens with real values
     * @param text Text to detokenize
     * @param activeTokens Optional list of known active tokens for fuzzy matching
     * @returns Detokenized text
     */
    async detokenize(text: string, activeTokens?: Set<string> | string[]): Promise<string> {
        // 1. Standard approach: Exact regex match
        // Extract all tokens from text (format: PREFIX_HEXHEX), allowing for concatenated tokens
        const tokenPattern = /[A-Z_]+[A-F0-9]{8}/g;
        const matches = Array.from(text.matchAll(tokenPattern));
        let tokens = matches.map(m => m[0]);

        // 2. Fallback approach: Context-aware fuzzy matching
        // If we know specific tokens were active in this context, look for them fuzzily
        if (activeTokens && (activeTokens instanceof Set ? activeTokens.size > 0 : activeTokens.length > 0)) {
            const activeList = Array.from(activeTokens);

            // Add known tokens to the list to ensure we try to restore them
            tokens = [...tokens, ...activeList];

            // Deduplicate
            tokens = [...new Set(tokens)];
        } else {
            const uniqueTokens = [...new Set(tokens)];
            if (uniqueTokens.length === 0) return text;
            tokens = uniqueTokens;
        }

        // Batch fetch real values
        const mappings = await this.storage.getMany(tokens);

        if (mappings.size === 0) {
            // this.logger?.warn?.('No token mappings found for detokenization');
            return text;
        }

        // Replace tokens with real values
        let result = text;

        // Priority 1: Exact matches (Fast & Safe)
        for (const [token, realValue] of mappings) {
            // Use global replace for exact token matches
            result = result.replaceAll(token, realValue);
        }

        // Priority 2: Fuzzy matches for active tokens (Slower, only for remaining tokens)
        if (activeTokens) {
            const activeList = Array.from(activeTokens);

            for (const token of activeList) {
                if (!mappings.has(token)) continue;

                const realValue = mappings.get(token)!;

                // If the text still contains parts of the token but wasn't replaced by exact match
                // Construct fuzzy regex: Allow spaces, case-insensitive, punctuation
                // e.g. ID_A1B2 -> /I\s*D\s*_\s*A\s*1\s*B\s*2/gi
                const fuzzyPattern = this.getCachedRegex(token).fuzzy;

                if (fuzzyPattern.test(result)) {
                    const before = result;
                    result = result.replace(fuzzyPattern, realValue);
                    if (before !== result) {
                        this.logger?.debug?.(`Fuzzy match restored: ${token}`);
                        continue;
                    }
                }

                // Suffix Match (Handle missing prefix like ID_ removed by LLM)
                if (token.length > MIN_TOKEN_LENGTH_FOR_SUFFIX_MATCH) {
                    const suffixPattern = this.getCachedRegex(token).suffix;
                    if (suffixPattern.test(result)) {
                        const before = result;
                        result = result.replace(suffixPattern, realValue);
                        if (before !== result) {
                            this.logger?.debug?.(`Suffix match restored: ${token}`);
                        }
                    }
                }
            }
        }

        const restoredCount = mappings.size; // This is approximation
        // this.logger?.info?.(`Detokenized approx ${restoredCount} tokens`);
        return result;
    }

    /**
     * Get cached regex patterns for a token, building them if not cached
     */
    private getCachedRegex(token: string): { fuzzy: RegExp; suffix: RegExp } {
        if (!this.regexCache.has(token)) {
            this.regexCache.set(token, {
                fuzzy: this.buildFuzzyRegex(token),
                suffix: this.buildSuffixRegex(token)
            });
        }
        return this.regexCache.get(token)!;
    }

    /**
     * Build a fuzzy regex for a token
     * Allows for whitespace, case insensitivity, and common separators
     */
    private buildFuzzyRegex(token: string): RegExp {
        const chars = token.split('');
        // Allow flexible separators between characters
        const pattern = chars.map(c => {
            if (c === '_') return '[_\\s-]*'; // Underscore is flexible
            return c + '[\\s-_]*'; // Each char can be followed by junk
        }).join('');

        // Remove trailing junk pattern
        const finalPattern = pattern.replace(/[\s-_]*$/, '');

        return new RegExp(finalPattern, 'gi');
    }

    /**
     * Build a suffix regex for a token (matches just the hex part)
     * e.g. ID_A1B2 -> Matches A1B2 with double word boundary protection
     */
    private buildSuffixRegex(token: string): RegExp {
        // Extract the hex part (last segment after underscore)
        const parts = token.split('_');
        if (parts.length < 2) return this.buildFuzzyRegex(token);

        const hex = parts[parts.length - 1];
        if (hex.length < MIN_HEX_LENGTH_FOR_SAFE_MATCH) {
            return this.buildFuzzyRegex(token); // Too short, risk of false positives
        }

        // Build pattern allowing for spaces/junk between chars
        const chars = hex.split('');
        const pattern = chars.map(c => c + '[\\s-_]*').join('');
        // Remove trailing junk pattern for cleaner matching
        const cleanPattern = pattern.replace(/\[\\s-_\]\*$/, '');

        // Double boundary protection:
        // - (?<![A-Za-z0-9]) : Must NOT be preceded by alphanumeric
        // - (?![A-Za-z0-9])  : Must NOT be followed by alphanumeric
        // This prevents matching hex in the middle of words like "orderAAAA1234confirmed"
        return new RegExp('(?<![A-Za-z0-9])' + cleanPattern + '(?![A-Za-z0-9])', 'gi');
    }

    /**
     * Tokenize request body (recursive for nested objects)
     * @param body Request body
     * @param context Optional context
     * @param activeTokens Optional set to collect tokens
     * @returns Tokenized body
     */
    async tokenizeRequest(body: any, context?: TokenizationContext, activeTokens?: Set<string>): Promise<any> {
        // Skip excessive logging for recursive calls to reduce noise (Bug #4)
        if (typeof body === 'string') {
            return await this.tokenize(body, context, activeTokens);
        }

        if (Array.isArray(body)) {
            return await Promise.all(
                body.map(item => this.tokenizeRequest(item, context, activeTokens))
            );
        }

        if (typeof body === 'object' && body !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(body)) {
                result[key] = await this.tokenizeRequest(value, context, activeTokens);
            }
            return result;
        }

        return body;
    }

    /**
     * Detokenize response body (recursive for nested objects)
     * @param body Response body
     * @param activeTokens Optional active tokens context
     * @returns Detokenized body
     */
    async detokenizeResponse(body: any, activeTokens?: Set<string> | string[]): Promise<any> {
        if (typeof body === 'string') {
            return await this.detokenize(body, activeTokens);
        }

        if (Array.isArray(body)) {
            return await Promise.all(
                body.map(item => this.detokenizeResponse(item, activeTokens))
            );
        }

        if (typeof body === 'object' && body !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(body)) {
                result[key] = await this.detokenizeResponse(value, activeTokens);
            }
            return result;
        }

        return body;
    }

    /**
     * Get storage statistics
     */
    getStats() {
        return this.storage.getStats();
    }

    /**
     * Get active detection rules
     */
    getRules() {
        return this.detector.getRules();
    }
}
