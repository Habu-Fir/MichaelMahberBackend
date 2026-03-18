// import express from 'express';
// import dotenv from 'dotenv';
// import cors from 'cors';
// import connectDB from './config/database';
// import contributionRoutes from './routes/contribution.routes';


// // Import routes
// import dashboardRoutes from './routes/dashboard.routes';
// import authRoutes from './routes/auth.routes';
// import userRoutes from './routes/user.routes';
// import loanRoutes from './routes/loan.routes';
// dotenv.config();
// connectDB();

// const app = express();
// const PORT = process.env.PORT || 5000;

// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// app.use(cors({
//   origin: process.env.CLIENT_URL || 'http://localhost:5173',
//   credentials: true
// }));

// // Mount routes
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/contributions', contributionRoutes);  // ADD THIS
// app.use('/api/loans', loanRoutes);

// app.use(cors({
//   origin: 'http://localhost:5173', // Your frontend URL
//   credentials: true
// }));

// // Serve uploaded files statically
// app.use('/uploads', express.static('uploads'));

// app.get('/health', (req, res) => {
//   res.status(200).json({
//     success: true,
//     message: 'Server is running',
//     timestamp: new Date().toISOString()
//   });
// });


// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     message: `Route ${req.originalUrl} not found`
//   });
// });

// app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
//   console.error('Error:', err.stack);
//   res.status(err.statusCode || 500).json({
//     success: false,
//     message: err.message || 'Internal Server Error'
//   });
// });

// app.listen(PORT, () => {
//   console.log(`\n🚀 Server running on port ${PORT}`);
//   console.log(`🔑 Auth routes: http://localhost:${PORT}/api/auth\n`);
// });

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import connectDB from './config/database';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import loanRoutes from './routes/loan.routes';
import contributionRoutes from './routes/contribution.routes';
import dashboardRoutes from './routes/dashboard.routes';

dotenv.config();

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IMPORTANT: Configure CORS for production
const allowedOrigins = [
  'http://localhost:5173',                    // Local development
  process.env.CLIENT_URL,                       // Your Vercel frontend URL (set later)
  'https://your-frontend.vercel.app'            // Replace with actual URL
].filter(Boolean);

// Simpler CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    
    // In production, allow all origins (or configure as needed)
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    
    // In development, allow localhost
    if (origin.includes('localhost')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// API Routes (MUST come before static files)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/contributions', contributionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// IMPORTANT: Serve static files from the client build folder (for production)
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the client build folder
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  
  // For any route not matching API, serve the React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;