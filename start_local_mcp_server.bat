@echo off
echo =========================================
echo  BSR Local Microsoft Playwright MCP Server
echo =========================================
echo.
echo Starting Microsoft's Playwright MCP Server locally...
echo Server will run on: http://localhost:3000
echo.
echo This will start our local MCP server that the BrowserAgent connects to.
echo Keep this window open while using the browser agent.
echo.
echo Press Ctrl+C to stop the server
echo.


echo Starting server...
echo.
set BSR_PERSISTENT_BROWSER=1
set BSR_PASSWORD_ENCRYPTION_KEY="gsuB3b7pKgoPMvKJwwsyAvMnkk3guNv0R+b5aYAVsYA="

node cli.js --port 3000 --user-data-dir ./bsr-browser-profile

pause 