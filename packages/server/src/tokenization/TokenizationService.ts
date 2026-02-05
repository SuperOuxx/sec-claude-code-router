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
     * 令牌化文本：使用无语义的令牌替换文本中的敏感数据。
     * 
     * @param text 待处理的原始文本
     * @param context 令牌化的上下文信息（如会话 ID）
     * @param activeTokens 用于收集本次请求生成的活跃令牌集合，便于后续还原
     * @returns 替换后的脱敏文本
     */
    async tokenize(text: string, context?: TokenizationContext, activeTokens?: Set<string>): Promise<string> {
        this.logger?.debug?.({ activeTokensPresent: !!activeTokens, textLen: text.length }, 'tokenize called');
        const findings = this.detector.detect(text);
        if (findings.length === 0) return text;

        let result = text;
        let offset = 0;

        for (const finding of findings) {
            // 为识别出的敏感数据生成唯一的随机令牌（如 ID_A1B2C3D4）
            const token = this.tokenGenerator.generate(finding.rule.tokenPrefix);

            // 记录活跃令牌：如果提供了集合，则将新生成的令牌加入。
            // 原因是 LLM 在后续响应中可能会返回这些令牌，我们需要知道哪些令牌是当前会话有效的，以便进行模糊匹配还原。
            if (activeTokens) {
                activeTokens.add(token);
                this.logger?.debug?.({ token, count: activeTokens.size }, 'Added active token');
            }

            // 存储映射：将令牌与真实值的对应关系存入存储层，并设置过期时间（TTL）。
            // 原因是去令牌化阶段需要根据令牌检索真实值，设置 TTL 是为了防止内存泄漏并确保敏感数据不会永久驻留。
            await this.storage.set(token, finding.match, TOKEN_TTL_MS);

            // 执行文本替换：根据最初检测到的位置进行切片替换。
            // 原因是使用 slice 结合偏移量（offset）可以精确处理同一次处理中的多次替换，
            // 避免因令牌长度与原数据长度不一导致的索引偏移问题。
            const startPos = finding.index + offset;
            const endPos = startPos + finding.match.length;
            result = result.slice(0, startPos) + token + result.slice(endPos);

            // 更新偏移量，确保后续替换的位置依然正确
            offset += token.length - finding.match.length;

            this.logger?.debug?.(`Tokenized: ${finding.rule.name} -> ${token}`);
        }

        this.logger?.info?.(`Tokenized ${findings.length} sensitive items in text`);
        return result;
    }

    /**
     * 去令牌化文本：将文本中的令牌还原为原始的真实数据。
     * 
     * @param text 包含令牌的文本（通常来自模型响应）
     * @param activeTokens 当前会话已知的活跃令牌列表，用于提升还原成功率
     * @returns 还原后的真实文本
     */
    async detokenize(text: string, activeTokens?: Set<string> | string[]): Promise<string> {
        // 第一阶段：标准还原（精确正则匹配）
        // 目的是快速提取文本中完全符合格式（如 PREFIX_HEXHEX）的字符串。
        const tokenPattern = /[A-Z_]+[A-F0-9]{8}/g;
        const matches = Array.from(text.matchAll(tokenPattern));
        let tokens = matches.map(m => m[0]);

        // 第二阶段：回退机制（上下文感知的模糊匹配准备）
        // 如果我们知道哪些令牌在当前请求中产生（活跃令牌），即使它们没在第一阶段被正则发现，也应放入待还原列表。
        // 原因是 LLM 有时会微调令牌格式（如加空格），导致标准正则失效。
        if (activeTokens && (activeTokens instanceof Set ? activeTokens.size > 0 : activeTokens.length > 0)) {
            const activeList = Array.from(activeTokens);

            // 将活跃令牌加入列表，确保我们尝试恢复它们
            tokens = [...tokens, ...activeList];

            // 去重处理
            tokens = [...new Set(tokens)];
        } else {
            const uniqueTokens = [...new Set(tokens)];
            if (uniqueTokens.length === 0) return text;
            tokens = uniqueTokens;
        }

        // 批量获取真实值，减少存储层 IO 压力
        const mappings = await this.storage.getMany(tokens);

        if (mappings.size === 0) {
            return text;
        }

        // 初始化结果
        let result = text;

        // 优先级 1：精确匹配还原（高性能且安全）
        // 首先处理文本中完全一致的令牌，因为这是最明确且最常见的场景。
        for (const [token, realValue] of mappings) {
            result = result.replaceAll(token, realValue);
        }

        // 优先级 2：针对活跃令牌的模糊匹配（较慢，但更强大）
        // 如果精确匹配后仍有残留，则利用活跃令牌的副本尝试查找毁坏的令牌。
        if (activeTokens) {
            const activeList = Array.from(activeTokens);

            for (const token of activeList) {
                if (!mappings.has(token)) continue;

                const realValue = mappings.get(token)!;

                // 如果文本中仍包含令牌的变体（如模型在字母间加了空格）
                // 构造模糊正则（如 I D _ A 1），原因是模型理解令牌为“代号”时，有时会为了排版改变其形式。
                const fuzzyPattern = this.getCachedRegex(token).fuzzy;

                if (fuzzyPattern.test(result)) {
                    const before = result;
                    result = result.replace(fuzzyPattern, realValue);
                    if (before !== result) {
                        this.logger?.debug?.(`Fuzzy match restored: ${token}`);
                        continue;
                    }
                }

                // 后缀匹配：处理模型丢失前缀的情况（如 ID_A1B2C3D4 被模型简化为 A1B2C3D4）
                // 原因是 8 位随机 Hex 具有极高的唯一性，只要配合边界检查，单独还原 Hex 后缀也是安全的。
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
