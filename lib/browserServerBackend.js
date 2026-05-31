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
import { Context } from './context.js';
import { logUnhandledError } from './log.js';
import { Response } from './response.js';
import { SessionLog } from './sessionLog.js';
import { SessionBrowserContextFactory } from './sessionBrowserContextFactory.js';
import { filteredTools } from './tools.js';
import { packageJSON } from './package.js';
export class BrowserServerBackend {
    name = 'Playwright';
    version = packageJSON.version;
    onclose;
    _tools;
    _context;
    _sessionLog;
    _config;
    _browserContextFactory;
    constructor(config, browserContextFactory) {
        this._config = config;
        this._browserContextFactory = browserContextFactory;
        this._tools = filteredTools(config);
    }
    async initialize() {
        this._sessionLog = this._config.saveSession ? await SessionLog.create(this._config) : undefined;
        this._context = new Context(this._tools, this._config, this._browserContextFactory, this._sessionLog);
    }
    tools() {
        return this._tools.map(tool => tool.schema);
    }
    async callTool(schema, parsedArguments) {
        const context = this._context;
        const response = new Response(context, schema.name, parsedArguments);
        const tool = this._tools.find(tool => tool.schema.name === schema.name);
        context.setRunningTool(true);
        try {
            await tool.handle(context, parsedArguments, response);
            await response.finish();
            this._sessionLog?.logResponse(response);
        }
        catch (error) {
            response.addError(String(error));
        }
        finally {
            context.setRunningTool(false);
        }
        return response.serialize();
    }
    serverInitialized(version) {
        this._context.clientVersion = version;
    }
    serverClosed() {
        this.onclose?.();
        // MINIMAL CHANGE: Close persistent sessions on server shutdown
        if (this._browserContextFactory instanceof SessionBrowserContextFactory) {
            void this._browserContextFactory.closeAllSessions().catch(logUnhandledError);
        }
        void this._context.dispose().catch(logUnhandledError);
    }
}
