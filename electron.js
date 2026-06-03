const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow;
let serverProcess;

function waitForServer(url, retries = 30, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (retries-- > 0) {
          setTimeout(attempt, delay);
        } else {
          reject(new Error('Server did not start in time'));
        }
      });
    };
    attempt();
  });
}

function startServer() {
  serverProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    env: process.env,
    stdio: 'ignore',
    detached: false,
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
}

async function createWindow() {
  // Start the bot + dashboard server
  startServer();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    title: '恵 ¦ Ebisu',
    backgroundColor: '#0b0b12',
    show: false, // hide until ready
    webPreferences: {
      nodeIntegration: false,
    }
  });

  // Show loading screen while server starts
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));
  mainWindow.show();

  // Wait for server to be ready
  try {
    await waitForServer('http://localhost:3002', 30, 1000);
    mainWindow.loadURL('http://localhost:3002');
  } catch (e) {
    mainWindow.loadFile(path.join(__dirname, 'error.html'));
  }

  // Open external links in browser not in app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});