import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import loanRoutes from './routes/loan.routes';
import contributionRoutes from './routes/contribution.routes';
import dashboardRoutes from './routes/dashboard.routes';
import systemRoutes from './routes/system.routes';
import './jobs/updateDailyInterest';

dotenv.config();

const app = express();
// Convert PORT to number explicitly
const PORT = parseInt(process.env.PORT || '5000', 10);

// =====================
// Middleware
// =====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: '*', // allow all for now (safe for testing)
    credentials: true
}));

// =====================
// Routes
// =====================
app.use('/api/system', systemRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// =====================
// Health Check
// =====================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Server is running'
    });
});

// =====================
// Error Handler
// =====================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Server Error'
    });
});

// =====================
// START SERVER FIRST - FIXED: Type-safe port binding
// =====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT} (binding to 0.0.0.0)`);
    console.log(`🌍 Health check available at http://0.0.0.0:${PORT}/health`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// =====================
// THEN CONNECT DATABASE
// =====================
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is not defined');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });