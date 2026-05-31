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
 * SessionManager - Manages persistent browser contexts across multiple MCP connections
 *
 * Key Features:
 * - Single browser context persists across multiple tool calls
 * - Reference counting to prevent premature closure
 * - Named sessions for different use cases (e.g., "dice-session", "linkedin-session")
 * - Automatic cleanup of unused sessions
 * - Thread-safe session management
 */
export class SessionManager {
    static _instance;
    _sessions = new Map();
    _contextFactory;
    _clientVersion;
    constructor(contextFactory) {
        this._contextFactory = contextFactory;
        testDebug('SessionManager created');
    }
    static getInstance(contextFactory) {
        if (!SessionManager._instance) {
            SessionManager._instance = new SessionManager(contextFactory);
        }
        return SessionManager._instance;
    }
    setClientVersion(clientVersion) {
        this._clientVersion = clientVersion;
    }
    /**
     * Get or create a persistent browser context for the given session
     * @param sessionId - Unique identifier for the session (defaults to "default")
     * @returns Managed browser context that persists across multiple calls
     */
    async getOrCreateSession(sessionId = 'default') {
        let session = this._sessions.get(sessionId);
        if (!session) {
            testDebug(`Creating new persistent session: ${sessionId}`);
            // Create new browser context using the factory
            const result = await this._contextFactory.createContext(this._clientVersion);
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
        return session.browserContext;
    }
    /**
     * Release a reference to a browser context
     * @param sessionId - Session identifier
     */
    releaseSession(sessionId = 'default') {
        const session = this._sessions.get(sessionId);
        if (!session) {
            testDebug(`Attempted to release non-existent session: ${sessionId}`);
            return;
        }
        session.refCount--;
        testDebug(`Session ${sessionId} released, refCount: ${session.refCount}`);
        // Don't auto-close sessions - let them persist for agent session reuse
        // Only close when explicitly requested or when agent shuts down
    }
    /**
     * Explicitly close a session and its browser context
     * @param sessionId - Session identifier
     */
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
    /**
     * Get information about all active sessions
     */
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
    /**
     * List all active session IDs
     */
    listSessions() {
        return Array.from(this._sessions.keys());
    }
    /**
     * Close all sessions - used during shutdown
     */
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
    /**
     * Clean up old unused sessions (sessions with 0 refCount older than specified time)
     * @param maxAgeMinutes - Maximum age in minutes for unused sessions
     */
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
}
