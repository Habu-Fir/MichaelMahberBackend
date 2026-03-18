import jwt from 'jsonwebtoken';

/**
 * =========================
 * 🔐 Generate JWT Token
 * =========================
 * 
 * @param id - User ID to encode in token
 * @returns JWT token string
 */
export const generateToken = (id: string): string => {
  // Validate environment variables at runtime
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  return jwt.sign(
    { id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE as jwt.SignOptions['expiresIn'] }
  );
};