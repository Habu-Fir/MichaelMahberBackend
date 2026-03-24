import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import {
  createUser,
  getUsers,
  getUser,
  updateUser,
  resetPassword,
  deleteUser,
  getUserStats
} from '../controllers/user.controller';

const router = Router();

// All routes require authentication
router.use(protect);

// Super Admin only routes
router.use(authorize('super_admin'));

// =====================
// IMPORTANT: Specific routes BEFORE dynamic routes
// =====================

// Get user statistics - MUST come before /:id
router.get('/stats', getUserStats);

// User CRUD operations
router.route('/')
  .get(getUsers)      // Get all users (paginated)
  .post(createUser);  // Create new user

// Dynamic routes - must come AFTER specific routes
router.route('/:id')
  .get(getUser)       // Get single user
  .put(updateUser)    // Update user
  .delete(deleteUser); // Deactivate user

// Reset user password
router.post('/:id/reset-password', resetPassword);

export default router;