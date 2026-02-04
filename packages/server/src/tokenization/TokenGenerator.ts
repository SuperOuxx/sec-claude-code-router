/**
 * Token generator for creating unique tokens
 */
export class TokenGenerator {
    /**
     * Generate a unique token with given prefix
     * @param prefix Token prefix (e.g., 'ID_', 'EMAIL_')
     * @returns Unique token string
     */
    generate(prefix: string): string {
        // Generate 8-character hex string for uniqueness
        const hex = Array.from({ length: 8 }, () =>
            Math.floor(Math.random() * 16).toString(16).toUpperCase()
        ).join('');

        return `${prefix}${hex}`;
    }

    /**
     * Check if a string is a valid token format
     * @param text Text to check
     * @returns True if text matches token pattern
     */
    isToken(text: string): boolean {
        // Match pattern: PREFIX_HEXSTRING (e.g., ID_A1B2C3D4)
        return /^[A-Z_]+[A-F0-9]{8}$/.test(text);
    }
}
