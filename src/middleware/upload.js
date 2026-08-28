'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sendError } = require('../utils/response');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads/proof';
const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `proof-${unique}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (
    ALLOWED_MIME_TYPES.includes(file.mimetype) &&
    ALLOWED_EXTENSIONS.includes(ext)
  ) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        `Only ${ALLOWED_EXTENSIONS.join(', ')} files are allowed.`
      ),
      false
    );
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

/**
 * Express error handler specifically for Multer errors.
 * Must be registered as a 4-argument error middleware AFTER the upload route.
 */
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, `File too large. Maximum size is ${MAX_SIZE_MB} MB.`, 400);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendError(res, err.field || 'Invalid file type.', 400);
    }
    return sendError(res, `File upload error: ${err.message}`, 400);
  }
  next(err);
}

module.exports = { upload, handleUploadError };
