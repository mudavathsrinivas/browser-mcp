# BSR Session Persistence - Quick Reference

## 🚀 **Quick Start**

### **Environment Setup**
```bash
# Set environment variable in your .bat file
set BSR_PERSISTENT_BROWSER=1

# Start MCP server
node cli.js --port 3000 --user-data-dir "./bsr-browser-profile" --save-session
```

### **Browser Agent Connection**
```python
# Browser agent connects to: http://localhost:3000/sse
MCPToolset(connection_params=SseConnectionParams(url="http://localhost:3000/sse"))
```

## 🛠️ **Session Management Tools**

### **Available Tools**
| Tool | Purpose | Usage |
|------|---------|--------|
| `browser_session_info` | View session status | `browser_session_info({})` |
| `browser_session_list` | List all sessions | `browser_session_list({})` |
| `browser_session_create` | Create session | `browser_session_create({"sessionId": "dice-session"})` |
| `browser_session_close` | Close session | `browser_session_close({"sessionId": "dice-session"})` |
| `browser_session_cleanup` | Cleanup old sessions | `browser_session_cleanup({"maxAgeMinutes": 60})` |

### **Common Usage Patterns**

#### **Multi-Platform Setup**
```python
# Create platform-specific sessions
browser_session_create({"sessionId": "dice-session"})
browser_session_create({"sessionId": "linkedin-session"}) 
browser_session_create({"sessionId": "indeed-session"})

# Use sessions for platform automation
# Sessions maintain login state, cookies, navigation history
```

#### **Session Management**
```python
# Check current session status
browser_session_info({})

# List all active sessions  
browser_session_list({})

# Clean up unused sessions (older than 1 hour)
browser_session_cleanup({"maxAgeMinutes": 60})
```

## 🔧 **Implementation Files**

### **Modified Files (7 lines total)**
```
src/server.ts     - 5 lines (import + factory wrap + cleanup)
src/tools.ts      - 2 lines (import + registration)
```

### **New Files (No conflicts)**
```
src/sessionBrowserContextFactory.ts  - Core session wrapper
src/tools/session.ts                 - Session management tools
```

## 🔄 **Merge Conflict Resolution**

### **If upstream changes cause conflicts:**

**`src/server.ts`** - Re-add these 5 lines:
```typescript
// Add import
import { SessionBrowserContextFactory } from './sessionBrowserContextFactory.js';

// Replace factory assignment (line ~33)
const baseFactory = contextFactory ?? defaultContextFactory(this._browserConfig);
this._contextFactory = new SessionBrowserContextFactory(baseFactory);

// Add cleanup in setupExitWatchdog (line ~50)
if (this._contextFactory instanceof SessionBrowserContextFactory) {
  await this._contextFactory.closeAllSessions();
}
```

**`src/tools.ts`** - Re-add these 2 lines:
```typescript
// Add import
import session from './tools/session.js';

// Add to allTools array
...session,
```

## 🧪 **Testing Commands**

### **Verify Installation**
```bash
cd apps/api/browser-mcp
npm run build
./start_local_mcp_server.bat
```

### **Test with Browser Agent**
```bash
cd apps/agents/bsr-ai-agents/browser-agent  
adk web browser_agent/agent.py
```

### **Test Session Persistence**
```python
# In browser agent chat:
1. "Create session dice-session"
2. "Navigate to https://www.dice.com" 
3. "Login to the platform"
4. Close agent and restart
5. "Check session info" - login should persist
```

## 📊 **Session Status Monitoring**

### **Debug Logging**
Enable debug logging to see session operations:
```bash
# Windows
set DEBUG=pw:mcp:session
node cli.js --port 3000

# Output example:
# DEBUG pw:mcp:session Creating new persistent session: dice-session
# DEBUG pw:mcp:session Session dice-session acquired, refCount: 1
```

### **Session Health Check**
```python
# Check if sessions are working properly
browser_session_info({})

# Expected output:
# Active Session ID: default
# Total Active Sessions: 1
# Session Details:
# - default (CURRENT)
#   URL: https://www.dice.com/
#   Created: 2025-01-26T18:30:00.000Z
#   References: 1
#   Status: Active
```

## ⚠️ **Common Issues & Solutions**

### **Session Not Persisting**
- Check environment variable: `BSR_PERSISTENT_BROWSER=1`
- Verify MCP server is using `--user-data-dir` parameter
- Check if browser context is being closed externally

### **Memory Issues**
- Use `browser_session_cleanup()` to remove old sessions
- Monitor session count with `browser_session_list()`
- Close unused sessions with `browser_session_close()`

### **Multiple Sessions Not Working**
- Ensure each platform uses unique session ID
- Check session isolation with `browser_session_info()`
- Verify no cross-session cookie contamination

## 🎯 **BSR-Specific Usage**

### **Job Platform Workflow**
```python
# 1. Setup platform sessions
browser_session_create({"sessionId": "dice-session"})
browser_navigate({"url": "https://www.dice.com"})
# Login process...

browser_session_create({"sessionId": "linkedin-session"})  
browser_navigate({"url": "https://www.linkedin.com/jobs"})
# Login process...

# 2. Use sessions for job applications
# Each session maintains separate login state
# No need to re-login between candidates

# 3. Cleanup when done
browser_session_cleanup({"maxAgeMinutes": 0})  # Force cleanup all
```

---

**💡 Tip**: Keep this file handy during BSR development for quick reference to session management commands and troubleshooting. 