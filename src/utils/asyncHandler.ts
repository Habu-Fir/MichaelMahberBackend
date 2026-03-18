import { Request, Response, NextFunction } from 'express';

// Wraps async functions to eliminate try-catch blocks
const asyncHandler = (fn: Function) =>
    (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

export default asyncHandler;