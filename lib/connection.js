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
import { v4 as uuidv4 } from 'uuid';
import { serverContext } from './mcp/server';
import { Tab } from './tab';
import { testDebug } from './log';
export class Connection {
    id;
    _contextPromise;
    _contextFactory;
    _config;
    _tabs = new Map();
    constructor(config, contextFactory) {
        this.id = uuidv4();
        this._config = config;
        this._contextFactory = contextFactory;
        this._contextPromise = this._contextFactory.createContext({ name: 'mcp' });
    }
    async getTab(tabId, create) {
        const { browserContext } = await this._contextPromise;
        if (tabId) {
            const tab = this._tabs.get(tabId);
            if (tab)
                return tab;
            if (!create)
                return;
        }
        const page = await browserContext.newPage();
        const tab = new Tab(this._config, page);
        this._tabs.set(tab.id, tab);
        page.on('close', () => {
            this._tabs.delete(tab.id);
            testDebug('tab closed', tab.id);
        });
        return tab;
    }
    async close() {
        const { close } = await this._contextPromise;
        await close();
    }
}
export function createConnection(config, contextFactory) {
    return serverContext.mcprpc.setClient(new Connection(config, contextFactory));
}
