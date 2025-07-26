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

import { z } from 'zod';
import { defineTool } from './tool.js';
import { SessionBrowserContextFactory } from '../sessionBrowserContextFactory.js';

const sessionInfo = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_session_info',
    title: 'Get browser session information',
    description: 'Get information about the current browser session including status, statistics, and active sessions',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const sessionFactory = context['_browserContextFactory'] as SessionBrowserContextFactory;
    const sessionInfo = sessionFactory.getSessionInfo();
    const currentSessionId = 'default'; // Default session ID used by wrapper
    
    response.addResult('Current Browser Session Status:');
    response.addResult(`Active Session ID: ${currentSessionId}`);
    response.addResult(`Total Active Sessions: ${sessionInfo.length}`);
    response.addResult('');
    
    if (sessionInfo.length > 0) {
      response.addResult('Session Details:');
      for (const session of sessionInfo) {
        const current = session.sessionId === currentSessionId ? ' (CURRENT)' : '';
        response.addResult(`- ${session.sessionId}${current}`);
        response.addResult(`  URL: ${session.url}`);
        response.addResult(`  Created: ${session.createdAt.toISOString()}`);
        response.addResult(`  Last Accessed: ${session.lastAccessedAt.toISOString()}`);
        response.addResult(`  References: ${session.refCount}`);
        response.addResult(`  Status: ${session.isActive ? 'Active' : 'Inactive'}`);
        response.addResult('');
      }
    } else {
      response.addResult('No active browser sessions found.');
    }
    
    response.addCode(`// Get session information`);
    response.addCode(`console.log('Browser sessions:', ${JSON.stringify(sessionInfo, null, 2)});`);
  },
});

const sessionList = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_session_list',
    title: 'List all browser sessions',
    description: 'List all active browser session IDs',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const sessionFactory = context['_browserContextFactory'] as SessionBrowserContextFactory;
    const sessions = sessionFactory.listSessions();
    const currentSessionId = 'default';
    
    response.addResult(`Active Browser Sessions (${sessions.length}):`);
    if (sessions.length > 0) {
      for (const sessionId of sessions) {
        const current = sessionId === currentSessionId ? ' (CURRENT)' : '';
        response.addResult(`- ${sessionId}${current}`);
      }
    } else {
      response.addResult('No active sessions found.');
    }
    
    response.addCode(`// List all sessions`);
    response.addCode(`const sessions = ${JSON.stringify(sessions)};`);
  },
});

const sessionCreate = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_session_create',
    title: 'Create new browser session',
    description: 'Create a new named browser session for different platforms or use cases',
    inputSchema: z.object({
      sessionId: z.string().describe('Unique identifier for the new session (e.g., "dice-session", "linkedin-session")'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const sessionFactory = context['_browserContextFactory'] as SessionBrowserContextFactory;
    
    try {
      // Get or create the session - this will create it if it doesn't exist
      const browserContext = await sessionFactory.getOrCreateSession(params.sessionId, context.clientVersion!);
      
      response.addResult(` Browser session created successfully!`);
      response.addResult(`Session ID: ${params.sessionId}`);
      response.addResult(`Browser Context: ${browserContext.browser()?.browserType().name() ?? 'unknown'}`);
      response.addResult(`Pages: ${browserContext.pages().length}`);
      
      response.addCode(`// Create new browser session`);
      response.addCode(`const sessionId = '${params.sessionId}';`);
      response.addCode(`console.log('Created session:', sessionId);`);
      
    } catch (error) {
      response.addResult(` Failed to create session: ${error}`);
      throw error;
    }
  },
});

const sessionClose = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_session_close',
    title: 'Close browser session',
    description: 'Explicitly close a browser session and its browser context',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to close'),
      force: z.boolean().optional().describe('Force close even if there are active references (default: false)'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const sessionFactory = context['_browserContextFactory'] as SessionBrowserContextFactory;
    
    try {
      const success = await sessionFactory.closeSession(params.sessionId);
      
      if (success) {
        response.addResult(` Browser session closed successfully!`);
        response.addResult(`Session ID: ${params.sessionId}`);
      } else {
        response.addResult(` Session not found or already closed: ${params.sessionId}`);
      }
      
      response.addCode(`// Close browser session`);
      response.addCode(`const sessionId = '${params.sessionId}';`);
      response.addCode(`console.log('Closed session:', sessionId);`);
      
    } catch (error) {
      response.addResult(` Failed to close session: ${error}`);
      throw error;
    }
  },
});

const sessionCleanup = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_session_cleanup',
    title: 'Cleanup old browser sessions',
    description: 'Clean up old unused browser sessions to free resources',
    inputSchema: z.object({
      maxAgeMinutes: z.number().optional().default(60).describe('Maximum age in minutes for unused sessions (default: 60)'),
    }),
    type: 'destructive',
  },

  handle: async (context, params, response) => {
    const sessionFactory = context['_browserContextFactory'] as SessionBrowserContextFactory;
    
    try {
      const cleanedCount = await sessionFactory.cleanupOldSessions(params.maxAgeMinutes || 60);
      
      response.addResult(` Session cleanup completed!`);
      response.addResult(`Sessions cleaned: ${cleanedCount}`);
      response.addResult(`Max age: ${params.maxAgeMinutes || 60} minutes`);
      
      const remainingSessions = sessionFactory.listSessions();
      response.addResult(`Remaining active sessions: ${remainingSessions.length}`);
      
      if (remainingSessions.length > 0) {
        response.addResult('Active sessions:');
        for (const sessionId of remainingSessions) {
          response.addResult(`- ${sessionId}`);
        }
      }
      
      response.addCode(`// Cleanup old sessions`);
      response.addCode(`const cleanedCount = ${cleanedCount};`);
      response.addCode(`console.log('Cleaned up sessions:', cleanedCount);`);
      
    } catch (error) {
      response.addResult(` Failed to cleanup sessions: ${error}`);
      throw error;
    }
  },
});

export default [
  sessionInfo,
  sessionList,
  sessionCreate,
  sessionClose,
  sessionCleanup,
];
