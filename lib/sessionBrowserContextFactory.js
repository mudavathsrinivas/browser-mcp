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
import debug from 'debug';
const testDebug = debug('pw:mcp:session');
/**
 * SessionBrowserContextFactory - Minimal wrapper that adds session persistence
 * to any existing BrowserContextFactory without modifying core MCP code.
 *
 * This factory maintains persistent browser contexts across multiple connections
 * while delegating actual browser context creation to the wrapped factory.
 */
export class SessionBrowserContextFactory {
    _wrappedFactory;
    _sessions = new Map();
    _defaultSessionId;
    constructor(wrappedFactory, defaultSessionId = 'default') {
        this._wrappedFactory = wrappedFactory;
        this._defaultSessionId = defaultSessionId;
        testDebug('SessionBrowserContextFactory created');
    }
    /**
     * Creates or returns existing persistent browser context
     */
    async createContext(clientInfo) {
        const sessionId = this._defaultSessionId;
        let session = this._sessions.get(sessionId);
        if (!session) {
            testDebug(`Creating new persistent session: ${sessionId}`);
            // Delegate to wrapped factory for actual browser context creation
            const result = await this._wrappedFactory.createContext(clientInfo);
            session = {
                browserContext: result.browserContext,
                close: result.close,
                refCount: 0,
                sessionId,
                createdAt: new Date(),
                lastAccessedAt: new Date()
            };
            this._sessions.set(sessionId, session);
            // Set up cleanup when browser context is closed externally
            session.browserContext.on('close', () => {
                testDebug(`Browser context closed externally for session: ${sessionId}`);
                this._sessions.delete(sessionId);
            });
        }
        // Increment reference count and update access time
        session.refCount++;
        session.lastAccessedAt = new Date();
        testDebug(`Session ${sessionId} acquired, refCount: ${session.refCount}`);
        // Return the persistent browser context with custom close logic
        return {
            browserContext: session.browserContext,
            close: () => this._releaseSession(sessionId)
        };
    }
    /**
     * Release a session reference instead of closing the browser context
     */
    async _releaseSession(sessionId) {
        const session = this._sessions.get(sessionId);
        if (!session) {
            testDebug(`Attempted to release non-existent session: ${sessionId}`);
            return;
        }
        session.refCount--;
        testDebug(`Session ${sessionId} released, refCount: ${session.refCount}`);
    }
    /**
     * Get or create a named session (for multi-platform support)
     */
    async getOrCreateSession(sessionId, clientInfo) {
        let session = this._sessions.get(sessionId);
        if (!session) {
            testDebug(`Creating new named session: ${sessionId}`);
            const result = await this._wrappedFactory.createContext(clientInfo);
            session = {
                browserContext: result.browserContext,
                close: result.close,
                refCount: 0,
                sessionId,
                createdAt: new Date(),
                lastAccessedAt: new Date()
            };
            this._sessions.set(sessionId, session);
            session.browserContext.on('close', () => {
                testDebug(`Browser context closed externally for session: ${sessionId}`);
                this._sessions.delete(sessionId);
            });
        }
        session.refCount++;
        session.lastAccessedAt = new Date();
        testDebug(`Named session ${sessionId} acquired, refCount: ${session.refCount}`);
        return session.browserContext;
    }
    async closeSession(sessionId) {
        const session = this._sessions.get(sessionId);
        if (!session) {
            testDebug(`Attempted to close non-existent session: ${sessionId}`);
            return false;
        }
        testDebug(`Explicitly closing session: ${sessionId}`);
        this._sessions.delete(sessionId);
        try {
            await session.close();
            return true;
        }
        catch (error) {
            testDebug(`Error closing session ${sessionId}:`, error);
            return false;
        }
    }
    getSessionInfo() {
        return Array.from(this._sessions.entries()).map(([sessionId, session]) => ({
            sessionId,
            refCount: session.refCount,
            createdAt: session.createdAt,
            lastAccessedAt: session.lastAccessedAt,
            url: session.browserContext.pages().length > 0 ? session.browserContext.pages()[0].url() : 'about:blank',
            isActive: session.browserContext.browser()?.isConnected() ?? false
        }));
    }
    listSessions() {
        return Array.from(this._sessions.keys());
    }
    async closeAllSessions() {
        testDebug(`Closing all ${this._sessions.size} sessions`);
        const closurePromises = Array.from(this._sessions.values()).map(async (session) => {
            try {
                await session.close();
            }
            catch (error) {
                testDebug(`Error closing session ${session.sessionId}:`, error);
            }
        });
        await Promise.all(closurePromises);
        this._sessions.clear();
        testDebug('All sessions closed');
    }
    async cleanupOldSessions(maxAgeMinutes = 60) {
        const now = new Date();
        const sessionsToClose = [];
        for (const [sessionId, session] of this._sessions.entries()) {
            if (session.refCount === 0) {
                const ageMinutes = (now.getTime() - session.lastAccessedAt.getTime()) / (1000 * 60);
                if (ageMinutes > maxAgeMinutes) {
                    sessionsToClose.push(sessionId);
                }
            }
        }
        testDebug(`Cleaning up ${sessionsToClose.length} old sessions`);
        for (const sessionId of sessionsToClose) {
            await this.closeSession(sessionId);
        }
        return sessionsToClose.length;
    }
    getWrappedFactory() {
        return this._wrappedFactory;
    }
}
