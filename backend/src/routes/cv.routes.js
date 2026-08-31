'use strict';

const { Router } = require('express');
const multer = require('multer');
const config = require('../config');
const cv = require('../controllers/cv.controller');

const router = Router();

/**
 * memoryStorage, deliberately: the file is streamed on to the ml-service and
 * then dropped. Nothing about a visitor's CV ever touches this server's disk.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter(_req, file, cb) {
    if (/\.(pdf|docx|doc)$/i.test(file.originalname || '')) return cb(null, true);
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PDF and DOCX files are accepted'));
  },
});

router.post('/parse', upload.single('file'), cv.parseCv);

module.exports = router;
