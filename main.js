const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn, fork } = require('child_process');

let mainWindow;
let serverProcess;
let pythonProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Wait a brief moment to ensure the server is up before loading the window
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3001');
    }, 2000);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // 1. Spawn Node Server using fork (uses Electron's built-in Node.js, doesn't require Node installed on host)
    const serverPath = path.join(__dirname, 'server', 'index.js');
    serverProcess = fork(serverPath, [], { cwd: path.join(__dirname, 'server'), stdio: 'pipe' });

    serverProcess.stdout.on('data', (data) => console.log(`[Server] ${data.toString().trim()}`));
    serverProcess.stderr.on('data', (data) => console.error(`[Server Error] ${data.toString().trim()}`));

    // 2. Spawn Python Transcriber Exe
    // In production, the transcriber.exe is expected to be bundled. For now we point to python/dist/transcriber.exe
    const pythonPath = path.join(__dirname, 'python', 'dist', 'transcriber.exe');
    pythonProcess = spawn(pythonPath, [], { cwd: path.join(__dirname, 'python', 'dist') });

    pythonProcess.stdout.on('data', (data) => console.log(`[Python] ${data.toString().trim()}`));
    pythonProcess.stderr.on('data', (data) => console.error(`[Python Error] ${data.toString().trim()}`));

    // 3. Create the game window
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Cleanly kill the background processes when the Electron app closes
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    console.log('Shutting down background processes...');
    if (serverProcess) serverProcess.kill();
    if (pythonProcess) pythonProcess.kill();
});
