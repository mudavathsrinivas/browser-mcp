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
import { createConnection } from './connection.js';
import { contextFactory as defaultContextFactory } from './browserContextFactory.js';
import { SessionBrowserContextFactory } from './sessionBrowserContextFactory.js';
export class Server {
    config;
    _connectionList = [];
    _browserConfig;
    _contextFactory;
    constructor(config, contextFactory) {
        this.config = config;
        this._browserConfig = config.browser;
        // MINIMAL CHANGE: Wrap the factory with session persistence
        const baseFactory = contextFactory ?? defaultContextFactory(this._browserConfig);
        this._contextFactory = new SessionBrowserContextFactory(baseFactory);
    }
    async createConnection(transport) {
        const connection = await createConnection(this.config, this._contextFactory);
        this._connectionList.push(connection);
        await connection.server.connect(transport);
        return connection;
    }
    setupExitWatchdog() {
        let isExiting = false;
        const handleExit = async () => {
            if (isExiting)
                return;
            isExiting = true;
            setTimeout(() => process.exit(0), 15000);
            await Promise.all(this._connectionList.map(connection => connection.close()));
            // MINIMAL CHANGE: Close persistent sessions
            if (this._contextFactory instanceof SessionBrowserContextFactory) {
                await this._contextFactory.closeAllSessions();
            }
            process.exit(0);
        };
        process.stdin.on('close', handleExit);
        process.on('SIGINT', handleExit);
        process.on('SIGTERM', handleExit);
    }
}
