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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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
// START SERVER FIRST
// =====================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// =====================
// THEN CONNECT DATABASE
// =====================
mongoose.connect(process.env.MONGODB_URI as string)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));