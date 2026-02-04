import { SensitiveRule, SensitiveFinding } from './types';
import { DEFAULT_RULES, getEnabledRules } from './rules/defaultRules';

/**
 * Sensitive data detector
 */
export class SensitiveDetector {
    private rules: SensitiveRule[];

    constructor(customRules?: SensitiveRule[], disabledRules?: string[]) {
        this.rules = getEnabledRules(customRules, disabledRules);
    }

    /**
     * Detect sensitive data in text
     * @param text Text to scan
     * @returns Array of findings sorted by index
     */
    detect(text: string): SensitiveFinding[] {
        const findings: SensitiveFinding[] = [];

        for (const rule of this.rules) {
            // Reset regex index to avoid issues with global flag
            rule.pattern.lastIndex = 0;

            const matches = text.matchAll(rule.pattern);
            for (const match of matches) {
                findings.push({
                    match: match[0],
                    rule,
                    index: match.index || 0,
                });
            }
        }

        // Sort by index to ensure proper replacement order
        return findings.sort((a, b) => a.index - b.index);
    }

    /**
     * Get active rules
     */
    getRules(): SensitiveRule[] {
        return [...this.rules];
    }

    /**
     * Add a custom rule at runtime
     * @param rule Rule to add
     */
    addRule(rule: SensitiveRule): void {
        if (rule.enabled) {
            this.rules.push(rule);
        }
    }

    /**
     * Remove a rule by name
     * @param ruleName Name of the rule to remove
     */
    removeRule(ruleName: string): void {
        this.rules = this.rules.filter(r => r.name !== ruleName);
    }
}
