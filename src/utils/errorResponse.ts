// Custom error class that includes HTTP status code
class ErrorResponse extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;

        // Capture stack trace for debugging
        Error.captureStackTrace(this, this.constructor);
    }
}

export default ErrorResponse;