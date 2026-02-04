import { SensitiveRule } from '../types';

/**
 * Default sensitive data detection rules
 */
export const DEFAULT_RULES: SensitiveRule[] = [
    {
        name: 'chinese_id_card',
        pattern: /\b[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
        tokenPrefix: 'ID_',
        enabled: true,
        description: 'Chinese ID card number (18 digits)',
    },
    {
        name: 'chinese_mobile',
        pattern: /\b1[3-9]\d{9}\b/g,
        tokenPrefix: 'MOBILE_',
        enabled: true,
        description: 'Chinese mobile phone number',
    },
    {
        name: 'email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        tokenPrefix: 'EMAIL_',
        enabled: true,
        description: 'Email address',
    },
    {
        name: 'ipv4',
        pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        tokenPrefix: 'IP_',
        enabled: true,
        description: 'IPv4 address',
    },
    {
        name: 'bank_card',
        pattern: /\b\d{16,19}\b/g,
        tokenPrefix: 'CARD_',
        enabled: true,
        description: 'Bank card number (16-19 digits)',
    },
    {
        name: 'password_field',
        pattern: /(?:password|passwd|pwd)[\s:=]+[^\s]+/gi,
        tokenPrefix: 'PWD_',
        enabled: true,
        description: 'Password in text (password=xxx format)',
    },
    {
        name: 'api_key',
        pattern: /\b(?:sk|pk)-[A-Za-z0-9]{32,}\b/g,
        tokenPrefix: 'KEY_',
        enabled: false,
        description: 'API keys (sk-xxx or pk-xxx format, disabled by default to avoid false positives)',
    },
    {
        name: 'credit_card',
        pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
        tokenPrefix: 'CC_',
        enabled: true,
        description: 'Credit card number (Visa, MasterCard, Amex, etc.)',
    },
];

/**
 * Get enabled rules
 */
export function getEnabledRules(
    customRules?: SensitiveRule[],
    disabledRules?: string[]
): SensitiveRule[] {
    const allRules = customRules ? [...DEFAULT_RULES, ...customRules] : DEFAULT_RULES;

    return allRules
        .filter(rule => rule.enabled)
        .filter(rule => !disabledRules?.includes(rule.name));
}
