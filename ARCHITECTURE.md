# @browser-mcp/ Architecture and Data Flow

This document provides a detailed explanation of the inner workings of `@browser-mcp/`, from establishing a connection to executing tool commands.

### High-Level Architecture

The `@browser-mcp/` component is designed as a server that exposes browser automation capabilities to a client through the Model Context Protocol (MCP). It uses Playwright for browser control and provides a set of tools that a client can call to interact with web pages.

Here is a diagram illustrating the main components and the data flow:

```mermaid
graph TD
    subgraph Client
        A[MCP Client]
    end

    subgraph Server Process
        B[Transport Layer <br/> (HTTP or Stdio)]
        C[MCP Server <br/> (connection.ts)]
        D[Context <br/> (context.ts)]
        E[BrowserContextFactory <br/> (browserContextFactory.ts)]
        F[Playwright BrowserContext]
        G[Tools <br/> (tools/*.ts)]
    end

    A -- MCP Request --> B
    B -- Raw Message --> C
    C -- Creates --> D
    C -- Dispatches Tool Call --> G
    D -- Requests Browser --> E
    E -- Creates/Connects to --> F
    D -- Holds Reference to --> F
    G -- Accesses Browser via --> D

```

### The Connection and Initialization Flow

Here is a step-by-step explanation of what happens when a client connects to the `@browser-mcp/` server:

1.  **Server Startup (`program.ts`):**
    *   The application is launched via the `program.ts` script, which parses command-line arguments. These arguments determine the configuration, such as which browser to use (`--browser`), whether to run in headless mode (`--headless`), and if a persistent session should be used (`--user-data-dir`).
    *   Based on the arguments, a `Server` instance is created, and a transport layer is started (either HTTP for network connections or stdio for local communication).

2.  **New Connection (`server.ts`):**
    *   When a new client connects, the transport layer signals the `Server` object.
    *   The `Server` class's `createConnection` method is called. This is the entry point for handling a new client session.

3.  **MCP Connection Setup (`connection.ts`):**
    *   The `createConnection` function in `connection.ts` is where the MCP-specific setup happens.
    *   An `McpServer` instance from the `@modelcontextprotocol/sdk` is created.
    *   Crucially, a `Context` object is instantiated. This object will hold all the state for this specific client's connection, including the browser instance.
    *   Request handlers are set up on the `McpServer`. The most important one is for `CallToolRequest`, which is triggered whenever the client wants to execute a command (e.g., navigate to a URL, click an element).

4.  **Browser Instantiation (`browserContextFactory.ts`):**
    *   The `Context` object doesn't create the browser instance directly. Instead, it relies on a `BrowserContextFactory`.
    *   The `browserContextFactory.ts` file contains a factory function that selects the appropriate strategy for creating a `BrowserContext` based on the initial configuration:
        *   **`PersistentContextFactory` (Default):** Launches a new browser instance that uses a persistent user data directory. This means cookies, local storage, and other session data are saved between runs.
        *   **`IsolatedContextFactory`:** Launches a completely fresh browser instance with a temporary profile, ensuring no state is shared. This is used when the `--isolated` flag is set.
        *   **`CdpContextFactory`:** Connects to an already running browser via its Chrome DevTools Protocol (CDP) endpoint. This is used with the `--cdp-endpoint` flag.
        *   **`RemoteContextFactory`:** Connects to a remote Playwright server.
    *   The factory returns a `BrowserContext` object, which is the core of Playwright's ability to interact with a browser.

5.  **Context Initialization (`context.ts`):**
    *   The `Context` object receives the `BrowserContext` from the factory. It then creates `Tab` objects for any pages that are already open in the browser.
    *   The `Context` holds the list of all open tabs and keeps track of which one is currently active.

### How Tools Access the Browser Instance

Now that the connection is established and the browser is running, the client can start calling tools. Here’s how a tool call flows through the system:

1.  **Client Sends a `CallToolRequest`:** The client sends an MCP message requesting to execute a tool, for example, `browser_navigate` with the arguments `{ "url": "https://www.google.com" }`.

2.  **MCP Server Handles the Request:** The `McpServer` in `connection.ts` receives this message and triggers the `CallToolRequest` handler.

3.  **Tool Execution:**
    *   The handler finds the tool implementation that matches the requested name (e.g., the `browser_navigate` tool object).
    *   It then calls the tool's `handle` method.
    *   **This is the key part:** The handler passes the `Context` object for the current connection to the tool's `handle` method.

4.  **Browser Interaction:**
    *   Inside the tool's `handle` method, it can now access the Playwright `BrowserContext` and the current `Tab` through the `Context` object it received.
    *   For example, the `browser_navigate` tool would call `context.currentTabOrDie().page.goto(url)`. This uses the Playwright `Page` object to navigate to the specified URL.
    *   The tool performs its actions and then returns a `Response` object, which is sent back to the client.

### Summary of Data Flow and Instance Management

*   **Singleton vs. Per-Connection:** The main `Server` object is a singleton for the entire process, but a new `Connection` and a new `Context` are created for each client that connects.
*   **Browser Lifecycle:** The lifecycle of the browser instance is managed by the `BrowserContextFactory`. In the default persistent mode, the browser might outlive a single connection if the same user data directory is used. In isolated mode, the browser is tied to the lifecycle of the `Context` and is destroyed when the client disconnects.
*   **State Management:** The `Context` object is the central piece of state management for a connection. It encapsulates the browser instance, the open tabs, and provides a clean interface for the tools to interact with them. This design ensures that tool implementations don't need to know the low-level details of how the browser was created or configured; they just work with the `Context` they are given. 