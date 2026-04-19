"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("./db");
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
const dataDir = path_1.default.join(__dirname, '../data');
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir, { recursive: true });
}
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});
app.use(routes_1.default);
app.use(express_1.default.static(path_1.default.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path_1.default.join(__dirname, '../client/dist/index.html'));
    }
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});
async function startServer() {
    await (0, db_1.initializeDatabase)();
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════╗
║     DISCIPLINE TRACKER SERVER RUNNING             ║
║     Port: ${PORT}                                ║
║     API:  http://localhost:${PORT}/api              ║
║     Default Admin: admin / admin123              ║
╚══════════════════════════════════════════════════════════╝
    `);
    });
}
startServer();
exports.default = app;
