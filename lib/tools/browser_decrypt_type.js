/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * BSR Password Decryption for MCP Server
 *
 * ENCRYPTION FORMAT (from API crypto.ts):
 * 1. Algorithm: AES-256-CBC
 * 2. Process: cipher.update(password, 'utf8', 'hex') + cipher.final('hex')
 * 3. Storage: Buffer.concat([IV(16 bytes), Buffer.from(encrypted_hex)])
 * 4. Output: combined.toString('base64')
 *
 * DECRYPTION PROCESS:
 * 1. Decode base64 to get combined buffer
 * 2. Extract IV (first 16 bytes) and encrypted data (rest)
 * 3. Decrypt using decipher.update(encrypted.toString('binary'), 'binary', 'utf8')
 */
import { z } from 'zod';
import { defineTabTool } from './tool.js';
import { elementSchema } from './snapshot.js';
import { generateLocator } from './utils.js';
import * as crypto from 'crypto';
// Constants matching crypto.ts exactly
const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
// Encryption key management (matching crypto.ts approach exactly)
let encryptionKey = null;
function getEncryptionKey() {
    if (!encryptionKey) {
        // Get encryption key from environment or generate one (same as crypto.ts)
        const keyString = process.env.BSR_PASSWORD_ENCRYPTION_KEY;
        if (keyString) {
            encryptionKey = Buffer.from(keyString, 'base64');
            if (encryptionKey.length !== KEY_LENGTH) {
                throw new Error('BSR_PASSWORD_ENCRYPTION_KEY must be 32 bytes (256 bits) when base64 decoded');
            }
        }
        else {
            // Generate a random key for development (same as crypto.ts)
            encryptionKey = crypto.randomBytes(KEY_LENGTH);
            console.warn('🔑 Using generated encryption key. Set BSR_PASSWORD_ENCRYPTION_KEY in production!');
            console.info(`Generated key (base64): ${encryptionKey.toString('base64')}`);
        }
    }
    return encryptionKey;
}
/**
 * Compatible decryption utility - matches crypto.ts decrypt method exactly
 */
function decryptText(encryptedText) {
    try {
        const encryptionKey = getEncryptionKey();
        // Decode base64 to get the combined buffer (same as crypto.ts)
        const combined = Buffer.from(encryptedText, 'base64');
        // Extract components exactly like crypto.ts
        const iv = combined.slice(0, IV_LENGTH); // First 16 bytes = IV
        const encrypted = combined.slice(IV_LENGTH); // Rest = encrypted data
        // Decrypt using the exact same method as crypto.ts
        const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
        // CRITICAL: Match crypto.ts decryption exactly
        // crypto.ts uses: decipher.update(encrypted.toString('binary'), 'binary', 'utf8')
        let decrypted = decipher.update(encrypted.toString('binary'), 'binary', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('❌ Password decryption failed:', error);
        throw new Error(`Failed to decrypt password: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// Schema extending elementSchema like browser_type does
const decryptTypeSchema = elementSchema.extend({
    encrypted_text: z.string().describe('Base64 encrypted text to type into the element'),
    submit: z.boolean().optional().describe('Whether to submit entered text (press Enter after)'),
    slowly: z.boolean().optional().describe('Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.'),
});
const browserDecryptType = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_decrypt_type',
        title: 'Type encrypted text for password fields',
        description: 'Decrypt and type text into editable element (secure version of browser_type) specifically for password fields',
        inputSchema: decryptTypeSchema,
        type: 'destructive',
    },
    handle: async (tab, params, response) => {
        response.setIncludeSnapshot();
        const locator = await tab.refLocator(params);
        // Decrypt the text (this happens server-side, never exposed to LLM)
        let decryptedText;
        try {
            decryptedText = decryptText(params.encrypted_text);
            console.log(`✅ Successfully decrypted text for element: ${params.element}`);
        }
        catch (error) {
            console.error(`❌ Decryption failed for element ${params.element}:`, error);
            throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        await tab.waitForCompletion(async () => {
            if (params.slowly) {
                response.addCode(`// Press "***" sequentially into "${params.element}"`);
                response.addCode(`await page.${await generateLocator(locator)}.pressSequentially('***');`);
                await locator.pressSequentially(decryptedText);
            }
            else {
                response.addCode(`// Fill "***" into "${params.element}"`);
                response.addCode(`await page.${await generateLocator(locator)}.fill('***');`);
                await locator.fill(decryptedText);
            }
            if (params.submit) {
                response.addCode(`// Submit text`);
                response.addCode(`await page.${await generateLocator(locator)}.press('Enter');`);
                await locator.press('Enter');
            }
        });
    },
});
export default [
    browserDecryptType,
];
